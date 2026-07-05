import LS2Request from '@enact/webos/LS2Request';

const TERMINAL_SERVICE = 'luna://org.webosbrew.terminal.service';
const HB_SPAWN_SERVICE = 'luna://org.webosbrew.hbchannel.service';

const SHELL_NOISE = [
	/\/bin\/sh: can't access tty; job control turned off\r?\n?/g,
	/script: failed to create pseudo-terminal:.*\r?\n?/g
];

function filterShellNoise (text) {
	let filtered = text;

	for (const pattern of SHELL_NOISE) {
		filtered = filtered.replace(pattern, '');
	}

	// Piped shells often emit lone CRs that jump the cursor to column 0.
	filtered = filtered.replace(/\r(?!\n)/g, '');

	return filtered;
}

function bytesFromText (text) {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(text);
	}

	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		bytes[i] = text.charCodeAt(i) & 0xff;
	}
	return bytes;
}

function textFromBytes (bytes) {
	if (typeof TextDecoder !== 'undefined') {
		return new TextDecoder().decode(bytes);
	}

	let text = '';
	for (let i = 0; i < bytes.length; i++) {
		text += String.fromCharCode(bytes[i]);
	}
	return text;
}

function decodeBase64 (data) {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return textFromBytes(bytes);
}

function encodeBase64 (text) {
	const bytes = bytesFromText(text);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function isWebOS () {
	return typeof window !== 'undefined' && (
		typeof window.WebOSServiceBridge === 'function' ||
		typeof window.PalmServiceBridge === 'function'
	);
}

class ShellSession {
	constructor ({cols = 80, rows = 24, initialCwd, onData, onExit, onError, onCwdChange, localEcho = true}) {
		this.cols = cols;
		this.rows = rows;
		this.initialCwd = initialCwd;
		this.onData = onData;
		this.onExit = onExit;
		this.onError = onError;
		this.onCwdChange = onCwdChange;
		this.localEcho = localEcho;
		this.sessionId = null;
		this.request = null;
		this.closed = false;
		this.mode = 'mock';
		this.inputBuffer = '';
		this.mockHistory = [];

		// Client-side command history for native/homebrew modes. Neither mode
		// has a real tty (no PTY in the service jail, or no stdin channel at
		// all for the Homebrew spawn fallback), so the shell itself can't do
		// readline-style recall -- we emulate up/down history ourselves.
		this.history = [];
		this.historyIndex = -1;
		this.historyDraft = '';

		if (isWebOS()) {
			this._openNativeSession();
		} else {
			this._openMockSession();
		}
	}

	_openNativeSession () {
		this.request = new LS2Request();
		this.request.send({
			service: TERMINAL_SERVICE,
			method: 'open',
			parameters: {cols: this.cols, rows: this.rows, cwd: this.initialCwd},
			subscribe: true,
			onSuccess: (response) => {
				if (response.sessionId && !this.sessionId) {
					this.sessionId = response.sessionId;
					this.mode = 'native';
				}

				if (response.type === 'stdout' || response.type === 'stderr') {
					const output = filterShellNoise(decodeBase64(response.data));
					if (output) {
						this.onData(output);
					}
				} else if (response.type === 'exit') {
					this.onExit(response.exitCode ?? 0);
				}
			},
			onFailure: (error) => {
				if (!this.closed) {
					this._openHomebrewFallback(error);
				}
			}
		});
	}

	_openHomebrewFallback (nativeError) {
		this.request?.cancel();
		this.request = new LS2Request();
		this.mode = 'homebrew';
		this.onData(
			'\r\n\x1b[33m[Degraded mode: Homebrew Channel spawn service]\x1b[0m\r\n' +
			'Each command runs in its own fresh shell -- no persistent state\r\n' +
			'(cd, exported vars) carries between commands, and there is no job\r\n' +
			'control or full-screen apps (vim, htop). Command history (up/down)\r\n' +
			'still works locally.\r\n$ '
		);

		this.request.send({
			service: HB_SPAWN_SERVICE,
			method: 'spawn',
			parameters: {command: '/bin/sh -i'},
			subscribe: true,
			onSuccess: (response) => {
				if (response.type === 'stdoutData' && response.stdoutBytes) {
					const output = filterShellNoise(decodeBase64(response.stdoutBytes));
					if (output) {
						this.onData(output);
					}
				} else if (response.type === 'stderrData' && response.stderrBytes) {
					const output = filterShellNoise(decodeBase64(response.stderrBytes));
					if (output) {
						this.onData(output);
					}
				} else if (response.type === 'exit' || response.type === 'close') {
					this.onExit(response.exitCode ?? response.closeCode ?? 0);
				}
			},
			onFailure: (error) => {
				const message = error?.errorText || nativeError?.errorText || 'Shell service unavailable';
				this.onError?.(message);
				this._openMockSession(message);
			}
		});
	}

	_openMockSession (reason) {
		this.mode = 'mock';
		this.onData(
			'\x1b[1;32mwebOS Terminal\x1b[0m (browser preview)\r\n' +
			(reason ? `\x1b[33m${reason}\x1b[0m\r\n` : '') +
			'Type commands and press Enter. Use "help" for available commands.\r\n\r\n$ '
		);
	}

	_nativeWrite (text) {
		if (!this.sessionId) {
			return;
		}

		const req = new LS2Request();
		req.send({
			service: TERMINAL_SERVICE,
			method: 'write',
			parameters: {
				sessionId: this.sessionId,
				data: encodeBase64(text)
			}
		});
	}

	_pushHistory (command) {
		if (command && this.history[this.history.length - 1] !== command) {
			this.history.push(command);
		}

		this.historyIndex = -1;
		this.historyDraft = '';
	}

	_replaceInputLine (newLine) {
		if (this.localEcho && this.inputBuffer) {
			this.onData('\b \b'.repeat(this.inputBuffer.length));
		}

		this.inputBuffer = newLine;

		if (this.localEcho && newLine) {
			this.onData(newLine);
		}
	}

	_historyUp () {
		if (!this.history.length) {
			return;
		}

		if (this.historyIndex === -1) {
			this.historyDraft = this.inputBuffer;
			this.historyIndex = this.history.length - 1;
		} else if (this.historyIndex > 0) {
			this.historyIndex -= 1;
		} else {
			return;
		}

		this._replaceInputLine(this.history[this.historyIndex]);
	}

	_historyDown () {
		if (this.historyIndex === -1) {
			return;
		}

		if (this.historyIndex < this.history.length - 1) {
			this.historyIndex += 1;
			this._replaceInputLine(this.history[this.historyIndex]);
		} else {
			this.historyIndex = -1;
			this._replaceInputLine(this.historyDraft);
			this.historyDraft = '';
		}
	}

	_handleInteractiveInput (char) {
		if (char === '\r' || char === '\n') {
			if (this.localEcho) {
				this.onData('\r\n');
			}

			if (this.mode === 'homebrew') {
				const command = this.inputBuffer.trim();
				this.inputBuffer = '';
				this._pushHistory(command);

				if (command) {
					this._runHomebrewCommand(command);
				} else if (this.localEcho) {
					this.onData('$ ');
				}
				return;
			}

			if (this.mode === 'native') {
				const line = this.inputBuffer;
				this.inputBuffer = '';
				this._pushHistory(line.trim());
				this._nativeWrite(line + '\n');
				this._pollCwd();
			}

			return;
		}

		if (char === '\u007F' || char === '\b') {
			this.historyIndex = -1;

			if (this.inputBuffer.length > 0) {
				this.inputBuffer = this.inputBuffer.slice(0, -1);
				if (this.localEcho) {
					this.onData('\b \b');
				}
			}
			return;
		}

		if (char >= ' ') {
			this.historyIndex = -1;
			this.inputBuffer += char;
			if (this.localEcho) {
				this.onData(char);
			}
		}
	}

	write (data) {
		if (this.closed || !data) {
			return;
		}

		if (this.mode === 'mock') {
			this._handleMockInput(data);
			return;
		}

		if (data === '\x1b[A') {
			this._historyUp();
			return;
		}

		if (data === '\x1b[B') {
			this._historyDown();
			return;
		}

		for (const char of data) {
			this._handleInteractiveInput(char);
		}
	}

	_runHomebrewCommand (command) {
		this.request?.cancel();
		this.request = new LS2Request();
		this.request.send({
			service: HB_SPAWN_SERVICE,
			method: 'spawn',
			parameters: {command},
			subscribe: true,
			onSuccess: (response) => {
				if (response.type === 'stdoutData' && response.stdoutBytes) {
					const output = filterShellNoise(decodeBase64(response.stdoutBytes));
					if (output) {
						this.onData(output);
					}
				} else if (response.type === 'stderrData' && response.stderrBytes) {
					const output = filterShellNoise(decodeBase64(response.stderrBytes));
					if (output) {
						this.onData(output);
					}
				} else if (response.type === 'exit' || response.type === 'close') {
					this.onData('\r\n$ ');
				}
			},
			onFailure: (error) => {
				this.onData(`\r\n\x1b[31m${error?.errorText || 'Command failed'}\x1b[0m\r\n$ `);
			}
		});
	}

	_handleMockInput (data) {
		for (const char of data) {
			if (char === '\r') {
				this.onData('\r\n');
				this._executeMockCommand(this.inputBuffer);
				this.inputBuffer = '';
				this.onData('$ ');
			} else if (char === '\u007F' || char === '\b') {
				if (this.inputBuffer.length > 0) {
					this.inputBuffer = this.inputBuffer.slice(0, -1);
					this.onData('\b \b');
				}
			} else if (char >= ' ') {
				this.inputBuffer += char;
				this.onData(char);
			}
		}
	}

	_executeMockCommand (line) {
		const command = line.trim();
		if (!command) return;

		this.mockHistory.push(command);

		switch (command) {
			case 'help':
				this.onData(
					'Available commands: help, clear, echo, history, uname, pwd\r\n' +
					'Deploy to a rooted webOS TV for a real shell.\r\n'
				);
				break;
			case 'clear':
				this.onData('\x1b[2J\x1b[H');
				break;
			case 'history':
				this.mockHistory.forEach((entry, index) => {
					this.onData(`${index + 1}  ${entry}\r\n`);
				});
				break;
			default:
				if (command.startsWith('echo ')) {
					this.onData(command.slice(5) + '\r\n');
				} else if (command === 'uname') {
					this.onData('webOS\r\n');
				} else if (command === 'pwd') {
					this.onData('/home/developer\r\n');
				} else {
					this.onData(`\x1b[33m${command}: command simulated in browser preview\x1b[0m\r\n`);
				}
		}
	}

	// Best-effort: ask the service what directory the shell is in after each
	// command, so tab persistence can restore it next launch. Failures (no
	// /proc in the jail, etc.) are silently ignored -- the tab just won't
	// remember its directory.
	_pollCwd () {
		if (this.mode !== 'native' || !this.onCwdChange) {
			return;
		}

		// Give the shell a moment to act on the command (e.g. `cd`) before
		// asking where it ended up.
		setTimeout(() => {
			if (this.closed || this.mode !== 'native' || !this.sessionId) {
				return;
			}

			const req = new LS2Request();
			req.send({
				service: TERMINAL_SERVICE,
				method: 'getCwd',
				parameters: {sessionId: this.sessionId},
				onSuccess: (response) => {
					if (response?.cwd) {
						this.onCwdChange(response.cwd);
					}
				},
				onFailure: () => {}
			});
		}, 300);
	}

	resize (cols, rows) {
		this.cols = cols;
		this.rows = rows;

		if (this.mode === 'native' && this.sessionId) {
			const req = new LS2Request();
			req.send({
				service: TERMINAL_SERVICE,
				method: 'resize',
				parameters: {sessionId: this.sessionId, cols, rows}
			});
		}
	}

	close () {
		this.closed = true;

		if (this.mode === 'native' && this.sessionId) {
			const req = new LS2Request();
			req.send({
				service: TERMINAL_SERVICE,
				method: 'close',
				parameters: {sessionId: this.sessionId}
			});
		}

		this.request?.cancel();
	}
}

export default ShellSession;