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
	constructor ({cols = 80, rows = 24, onData, onExit, onError, localEcho = true}) {
		this.cols = cols;
		this.rows = rows;
		this.onData = onData;
		this.onExit = onExit;
		this.onError = onError;
		this.localEcho = localEcho;
		this.sessionId = null;
		this.request = null;
		this.closed = false;
		this.mode = 'mock';
		this.inputBuffer = '';
		this.mockHistory = [];

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
			parameters: {cols: this.cols, rows: this.rows},
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
		this.onData('\r\n[Using Homebrew Channel spawn service]\r\n$ ');

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

	_handleInteractiveInput (char) {
		if (char === '\r' || char === '\n') {
			if (this.localEcho) {
				this.onData('\r\n');
			}

			if (this.mode === 'homebrew') {
				const command = this.inputBuffer.trim();
				this.inputBuffer = '';

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
				this._nativeWrite(line + '\n');
			}

			return;
		}

		if (char === '\u007F' || char === '\b') {
			if (this.inputBuffer.length > 0) {
				this.inputBuffer = this.inputBuffer.slice(0, -1);
				if (this.localEcho) {
					this.onData('\b \b');
				}
			}
			return;
		}

		if (char >= ' ') {
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