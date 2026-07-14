import LS2Request from '@enact/webos/LS2Request';

const TERMINAL_SERVICE = 'luna://com.github.gprot42.webosterminal.service';
const HB_SPAWN_SERVICE = 'luna://org.webosbrew.hbchannel.service';

const SHELL_NOISE = [
	/\/bin\/sh: can't access tty; job control turned off\r?\n?/g,
	/script: failed to create pseudo-terminal:.*\r?\n?/g
];

// Strip known shell startup noise. For piped (non-PTY) sessions also drop lone
// CRs that jump the cursor to column 0. Real PTYs use bare CR for cursor
// control in full-screen apps, so those must be preserved.
function filterShellNoise (text, {piped = true} = {}) {
	let filtered = text;

	for (const pattern of SHELL_NOISE) {
		filtered = filtered.replace(pattern, '');
	}

	if (piped) {
		filtered = filtered.replace(/\r(?!\n)/g, '');
	}

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
	constructor ({cols = 80, rows = 24, initialCwd, automationPassword, onData, onExit, onError, onCwdChange, onInputModeChange, localEcho = true}) {
		this.cols = cols;
		this.rows = rows;
		this.initialCwd = initialCwd;
		this.automationPassword = automationPassword;
		this.onData = onData;
		this.onExit = onExit;
		this.onError = onError;
		this.onCwdChange = onCwdChange;
		this.onInputModeChange = onInputModeChange;
		// Requested local echo for line-buffered modes. Forced off once a real
		// PTY is confirmed (the shell/TTY owns echo and line editing).
		this.localEcho = localEcho;
		this.sessionId = null;
		this.request = null;
		this.closed = false;
		this.mode = 'connecting';
		// True when the native service attached a real PTY (ptybridge/script).
		// Input is then forwarded byte-for-byte; shell readline/TUIs own editing.
		this.usingPty = false;
		this.isRoot = false;
		this.uid = null;
		this.inputBuffer = '';

		// Client-side command history for piped native / homebrew modes only.
		// Those lack a real tty, so the shell can't do readline-style recall
		// and we emulate up/down history ourselves. Unused when usingPty.
		this.history = [];
		this.historyIndex = -1;
		this.historyDraft = '';

		if (isWebOS()) {
			// Open immediately as the service user (usually prisoner / non-root).
			// That is enough for real Linux commands. Root is optional via elevate.
			this._notifyInputModeChange();
			this._openNativeSession();
		} else {
			this._openErrorSession(
				'Not running on webOS — PalmServiceBridge unavailable. Deploy the IPK to a rooted TV.'
			);
		}
	}

	// Raw character passthrough: native session with a working PTY.
	// Callers must not local-echo in this mode (the PTY/shell echoes).
	usesRawInput () {
		return this.mode === 'native' && this.usingPty;
	}

	_notifyInputModeChange () {
		this.onInputModeChange?.({
			mode: this.mode,
			usingPty: this.usingPty,
			raw: this.usesRawInput(),
			isRoot: this.isRoot,
			uid: this.uid
		});
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
					this.usingPty = Boolean(response.usingPty);
					this.isRoot = Boolean(response.isRoot);
					this.uid = response.uid != null ? response.uid : null;

					if (this.usingPty) {
						// Shell/TTY owns echo, history, tab-complete, and raw apps.
						this.localEcho = false;
					}

					this.registerUiSession(this.automationPassword);
					this._notifyInputModeChange();

					if (this.isRoot) {
						this.onData?.(
							`\x1b[32m[shell: root (uid=0)${
								this.usingPty ? ', PTY' : ', piped'
							}]\x1b[0m\r\n`
						);
					} else {
						this.onData?.(
							`\x1b[36m[shell: non-root (uid=${String(this.uid)}) — ` +
							'real Linux commands OK; elevate service for root/#]\x1b[0m\r\n'
						);
					}
				}

				if (response.type === 'stdout' || response.type === 'stderr') {
					const output = filterShellNoise(decodeBase64(response.data), {
						piped: !this.usingPty
					});
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
		this.usingPty = false;
		this._notifyInputModeChange();
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
				this._openErrorSession(message);
			}
		});
	}

	/** Hard failure — no fake offline command simulation. */
	_openErrorSession (reason) {
		this.mode = 'error';
		this.usingPty = false;
		this._notifyInputModeChange();
		this.onData(
			'\x1b[1;31m[shell unavailable]\x1b[0m\r\n' +
			(reason ? `\x1b[33m${reason}\x1b[0m\r\n` : '') +
			'\r\nDeploy the IPK to a rooted webOS TV with Homebrew Channel.\r\n' +
			'Default shell is non-root (prisoner) — enough for normal Linux commands.\r\n' +
			'Optional root: elevate the package service (see install docs).\r\n'
		);
	}

	setAutomationPassword (automationPassword) {
		this.automationPassword = automationPassword;
	}

	registerUiSession (automationPassword = this.automationPassword) {
		if (!this.sessionId || this.mode !== 'native') {
			return;
		}

		const reg = new LS2Request();
		reg.send({
			service: TERMINAL_SERVICE,
			method: 'registerUiSession',
			parameters: {
				sessionId: this.sessionId,
				automationPassword
			}
		});
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

		// No input until a real shell is ready; never simulate commands.
		if (this.mode === 'connecting' || this.mode === 'error') {
			return;
		}

		// Real PTY: forward every keystroke immediately. The shell owns
		// readline history, tab-complete, job control, and full-screen apps.
		if (this.usesRawInput()) {
			this._nativeWrite(data);

			// Best-effort cwd refresh after the user submits a line (Enter).
			if (/[\r\n]/.test(data)) {
				this._pollCwd();
			}

			return;
		}

		// Piped / homebrew: client-side line editing + history.
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