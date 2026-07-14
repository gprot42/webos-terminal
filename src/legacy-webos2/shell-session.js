/**
 * Shell session client for the legacy webOS 1–2 UI.
 * Talks to com.github.gprot42.webosterminal.service via PalmServiceBridge.
 *
 * Default: real shell as the service user (usually prisoner / non-root).
 * Optional root: elevate the service (SSH elevate-service or install script).
 * No mock/offline fake shell — only real Luna shells or a hard error.
 *
 * ES5 only. Depends on LegacyBridge.
 */
/* global LegacyBridge */
var LegacyShellSession = (function () {
	'use strict';

	var TERMINAL_SERVICE = 'luna://com.github.gprot42.webosterminal.service';
	var HB_SPAWN_SERVICE = 'luna://org.webosbrew.hbchannel.service';

	var SHELL_NOISE = [
		/\/bin\/sh: can't access tty; job control turned off\r?\n?/g,
		/script: failed to create pseudo-terminal:.*\r?\n?/g
	];

	function filterShellNoise (text, piped) {
		var filtered = text;
		var i;

		for (i = 0; i < SHELL_NOISE.length; i++) {
			filtered = filtered.replace(SHELL_NOISE[i], '');
		}

		if (piped) {
			filtered = filtered.replace(/\r(?!\n)/g, '');
		}

		return filtered;
	}

	function decodeBase64 (data) {
		var binary;
		var bytes;
		var i;
		var text = '';

		try {
			binary = atob(data);
		} catch (err) {
			return '';
		}

		if (typeof TextDecoder !== 'undefined') {
			bytes = new Uint8Array(binary.length);

			for (i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}

			try {
				return new TextDecoder().decode(bytes);
			} catch (err2) {
				// fall through
			}
		}

		for (i = 0; i < binary.length; i++) {
			text += binary.charAt(i);
		}

		return text;
	}

	function encodeBase64 (text) {
		var i;
		var binary = '';

		for (i = 0; i < text.length; i++) {
			binary += String.fromCharCode(text.charCodeAt(i) & 0xff);
		}

		try {
			return btoa(binary);
		} catch (err) {
			return '';
		}
	}

	function ShellSession (opts) {
		opts = opts || {};
		this.cols = opts.cols || 80;
		this.rows = opts.rows || 24;
		this.onData = opts.onData || function () {};
		this.onExit = opts.onExit || function () {};
		this.onError = opts.onError || function () {};
		this.onMode = opts.onMode || function () {};
		this.localEcho = opts.localEcho !== false;
		this.sessionId = null;
		this.request = null;
		this.closed = false;
		this.mode = 'connecting';
		this.usingPty = false;
		this.isRoot = false;
		this.uid = null;
		this.inputBuffer = '';
		this.history = [];
		this.historyIndex = -1;
		this.historyDraft = '';

		if (LegacyBridge.hasBridge()) {
			this._notifyMode();
			// Open the package service immediately. Default is non-root (prisoner)
			// until the user elevates the service; that is enough for real Linux
			// commands. Root is optional (PTY / full filesystem).
			this._openNative();
		} else {
			this._openError(
				'PalmServiceBridge is not available. ' +
				'This app must run on a webOS TV (not a desktop browser) with the package service installed.'
			);
		}
	}

	ShellSession.prototype.usesRawInput = function () {
		return this.mode === 'native' && this.usingPty;
	};

	ShellSession.prototype._notifyMode = function () {
		this.onMode({
			mode: this.mode,
			usingPty: this.usingPty,
			raw: this.usesRawInput(),
			isRoot: this.isRoot,
			uid: this.uid
		});
	};

	ShellSession.prototype._openNative = function () {
		var self = this;
		var settled = false;
		var openTimer = setTimeout(function () {
			if (settled || self.closed || self.sessionId) {
				return;
			}

			settled = true;

			if (self.request && self.request.cancel) {
				self.request.cancel();
			}

			self._openHomebrew({
				errorText: 'Shell service open timed out',
				returnValue: false
			});
		}, 8000);

		this.request = LegacyBridge.request({
			uri: TERMINAL_SERVICE + '/open',
			params: {cols: this.cols, rows: this.rows},
			subscribe: true,
			onSuccess: function (response) {
				if (response.sessionId && !self.sessionId) {
					settled = true;

					if (openTimer) {
						clearTimeout(openTimer);
						openTimer = null;
					}

					self.sessionId = response.sessionId;
					self.mode = 'native';
					self.usingPty = !!response.usingPty;
					self.isRoot = !!response.isRoot;
					self.uid = response.uid != null ? response.uid : null;

					if (self.usingPty) {
						self.localEcho = false;
					}

					self._registerUi();
					self._notifyMode();

					if (self.isRoot) {
						self.onData(
							'\x1b[32m[shell: root (uid=0)' +
							(self.usingPty ? ', PTY' : ', piped') +
							']\x1b[0m\r\n'
						);
					} else {
						self.onData(
							'\x1b[36m[shell: non-root' +
							(self.uid != null ? ' (uid=' + String(self.uid) + ')' : '') +
							' — real Linux commands OK; elevate service for root/#]\x1b[0m\r\n'
						);
					}
				}

				if (response.type === 'stdout' || response.type === 'stderr') {
					var output = filterShellNoise(decodeBase64(response.data), !self.usingPty);

					if (output) {
						self.onData(output);
					}
				} else if (response.type === 'exit') {
					self.onExit(response.exitCode != null ? response.exitCode : 0);
				}
			},
			onFailure: function (error) {
				if (settled || self.closed) {
					return;
				}

				settled = true;

				if (openTimer) {
					clearTimeout(openTimer);
					openTimer = null;
				}

				self._openHomebrew(error);
			}
		});
	};

	ShellSession.prototype._registerUi = function () {
		if (!this.sessionId) {
			return;
		}

		LegacyBridge.request({
			uri: TERMINAL_SERVICE + '/registerUiSession',
			params: {sessionId: this.sessionId, automationPassword: 'webos'}
		});
	};

	ShellSession.prototype._openHomebrew = function (nativeError) {
		var self = this;

		if (this.request && this.request.cancel) {
			this.request.cancel();
		}

		this.mode = 'homebrew';
		this.usingPty = false;
		this.localEcho = true;
		this._notifyMode();
		this.onData(
			'\r\n\x1b[33m[Degraded: Homebrew Channel spawn — real shell, no persistent state]\x1b[0m\r\n' +
			'Each command is a fresh spawn. Elevate the package service for a normal session.\r\n$ '
		);

		this.request = LegacyBridge.request({
			uri: HB_SPAWN_SERVICE + '/spawn',
			params: {command: '/bin/sh -i'},
			subscribe: true,
			onSuccess: function (response) {
				var output;

				if (response.type === 'stdoutData' && response.stdoutBytes) {
					output = filterShellNoise(decodeBase64(response.stdoutBytes), true);

					if (output) {
						self.onData(output);
					}
				} else if (response.type === 'stderrData' && response.stderrBytes) {
					output = filterShellNoise(decodeBase64(response.stderrBytes), true);

					if (output) {
						self.onData(output);
					}
				} else if (response.type === 'exit' || response.type === 'close') {
					self.onExit(response.exitCode != null ? response.exitCode : 0);
				}
			},
			onFailure: function (error) {
				var msg = (error && error.errorText) ||
					(nativeError && nativeError.errorText) ||
					'Shell service unavailable';

				self.onError(msg);
				self._openError(msg);
			}
		});
	};

	/**
	 * Hard failure — no fake command simulation. User must fix service/install.
	 */
	ShellSession.prototype._openError = function (reason) {
		this.mode = 'error';
		this.usingPty = false;
		this.localEcho = false;
		this._notifyMode();
		this.onData(
			'\x1b[1;31m[shell unavailable]\x1b[0m\r\n' +
			(reason ? ('\x1b[33m' + reason + '\x1b[0m\r\n') : '') +
			'\r\n' +
			'webOS Terminal needs the installed package service (and/or Homebrew Channel).\r\n' +
			'On a rooted TV:\r\n' +
			'  1. Reinstall the IPK and open Homebrew Channel once after boot\r\n' +
			'  2. ls-control scan-services; relaunch this app\r\n' +
			'Default shell is non-root (prisoner) — that is enough for normal Linux commands.\r\n' +
			'Optional root: elevate-service com.github.gprot42.webosterminal.service\r\n'
		);
	};

	ShellSession.prototype._nativeWrite = function (text) {
		if (!this.sessionId) {
			return;
		}

		LegacyBridge.request({
			uri: TERMINAL_SERVICE + '/write',
			params: {
				sessionId: this.sessionId,
				data: encodeBase64(text)
			}
		});
	};

	ShellSession.prototype._pushHistory = function (command) {
		if (command && this.history[this.history.length - 1] !== command) {
			this.history.push(command);
		}

		this.historyIndex = -1;
		this.historyDraft = '';
	};

	ShellSession.prototype._replaceInputLine = function (newLine) {
		var i;

		if (this.localEcho && this.inputBuffer) {
			for (i = 0; i < this.inputBuffer.length; i++) {
				this.onData('\b \b');
			}
		}

		this.inputBuffer = newLine;

		if (this.localEcho && newLine) {
			this.onData(newLine);
		}
	};

	ShellSession.prototype._historyUp = function () {
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
	};

	ShellSession.prototype._historyDown = function () {
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
	};

	ShellSession.prototype._runHomebrewCommand = function (command) {
		var self = this;

		if (this.request && this.request.cancel) {
			this.request.cancel();
		}

		this.request = LegacyBridge.request({
			uri: HB_SPAWN_SERVICE + '/spawn',
			params: {command: command},
			subscribe: true,
			onSuccess: function (response) {
				var output;

				if (response.type === 'stdoutData' && response.stdoutBytes) {
					output = filterShellNoise(decodeBase64(response.stdoutBytes), true);

					if (output) {
						self.onData(output);
					}
				} else if (response.type === 'stderrData' && response.stderrBytes) {
					output = filterShellNoise(decodeBase64(response.stderrBytes), true);

					if (output) {
						self.onData(output);
					}
				} else if (response.type === 'exit' || response.type === 'close') {
					self.onData('\r\n$ ');
				}
			},
			onFailure: function (error) {
				self.onData(
					'\r\n\x1b[31m' +
					((error && error.errorText) || 'Command failed') +
					'\x1b[0m\r\n$ '
				);
			}
		});
	};

	ShellSession.prototype._handleLineChar = function (ch) {
		if (ch === '\r' || ch === '\n') {
			if (this.localEcho) {
				this.onData('\r\n');
			}

			if (this.mode === 'homebrew') {
				var command = this.inputBuffer.replace(/^\s+|\s+$/g, '');
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
				var line = this.inputBuffer;
				this.inputBuffer = '';
				this._pushHistory(line.replace(/^\s+|\s+$/g, ''));
				this._nativeWrite(line + '\n');
			}

			return;
		}

		if (ch === '\u007f' || ch === '\b') {
			this.historyIndex = -1;

			if (this.inputBuffer.length > 0) {
				this.inputBuffer = this.inputBuffer.substring(0, this.inputBuffer.length - 1);

				if (this.localEcho) {
					this.onData('\b \b');
				}
			}

			return;
		}

		if (ch >= ' ') {
			this.historyIndex = -1;
			this.inputBuffer += ch;

			if (this.localEcho) {
				this.onData(ch);
			}
		}
	};

	ShellSession.prototype.write = function (data) {
		var i;

		if (this.closed || !data) {
			return;
		}

		// No input until a real shell is ready; never simulate commands.
		if (this.mode === 'connecting' || this.mode === 'error') {
			return;
		}

		if (this.usesRawInput()) {
			this._nativeWrite(data);
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

		for (i = 0; i < data.length; i++) {
			this._handleLineChar(data.charAt(i));
		}
	};

	ShellSession.prototype.resize = function (cols, rows) {
		this.cols = cols;
		this.rows = rows;

		if (this.mode === 'native' && this.sessionId) {
			LegacyBridge.request({
				uri: TERMINAL_SERVICE + '/resize',
				params: {sessionId: this.sessionId, cols: cols, rows: rows}
			});
		}
	};

	ShellSession.prototype.close = function () {
		this.closed = true;

		if (this.mode === 'native' && this.sessionId) {
			LegacyBridge.request({
				uri: TERMINAL_SERVICE + '/close',
				params: {sessionId: this.sessionId}
			});
		}

		if (this.request && this.request.cancel) {
			this.request.cancel();
		}
	};

	return ShellSession;
}());
