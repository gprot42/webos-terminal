/**
 * Legacy webOS 1–2 application shell (vanilla DOM).
 * Cut-down terminal: no React, Enact, or xterm.js.
 * ES5 only. Depends on LegacyAnsiTerminal, LegacyShellSession.
 */
/* global LegacyAnsiTerminal, LegacyShellSession, LEGACY_APP_VERSION */
var LegacyApp = (function () {
	'use strict';

	var BANNER =
		'Cut-down legacy shell for webOS 1–2 (WebKit 537–538). ' +
		'Feature set is limited versus the full app on webOS 4+. ' +
		'Root + Homebrew Channel required for a real shell.';

	function estimateSize () {
		var w = window.innerWidth || document.documentElement.clientWidth || 1280;
		var h = window.innerHeight || document.documentElement.clientHeight || 720;
		// Leave room for header, banner, toolbar
		var usableH = Math.max(200, h - 200);
		var usableW = Math.max(320, w - 40);
		var fontSize = 18;
		var lineHeight = fontSize * 1.25;
		var cols = Math.max(40, Math.min(120, Math.floor(usableW / (fontSize * 0.6))));
		var rows = Math.max(12, Math.min(40, Math.floor(usableH / lineHeight)));

		return {cols: cols, rows: rows};
	}

	function setStatus (el, text) {
		if (el) {
			el.innerHTML = '';
			el.appendChild(document.createTextNode(text));
		}
	}

	function mount (root) {
		var size = estimateSize();
		var version = (typeof LEGACY_APP_VERSION !== 'undefined' && LEGACY_APP_VERSION) || '0.0.0';
		var term;
		var session;
		var statusEl;
		var termEl;
		var proxyEl;
		var headerHtml;

		root.innerHTML = '';
		root.id = 'root';

		var app = document.createElement('div');
		app.id = 'legacy-app';

		headerHtml =
			'<div class="legacy-header">' +
				'<h1>webOS Terminal</h1>' +
				'<span class="legacy-badge">Legacy</span>' +
				'<span class="legacy-status" id="legacy-status">Starting…</span>' +
			'</div>' +
			'<div class="legacy-banner">' + BANNER + ' Version ' + version + '.</div>' +
			'<div class="legacy-term-wrap">' +
				'<div id="legacy-term" tabindex="0"></div>' +
			'</div>' +
			'<div class="legacy-toolbar">' +
				'<button type="button" data-send="\\t">Tab</button>' +
				'<button type="button" data-send="\\x1b">Esc</button>' +
				'<button type="button" data-send="\\x03">Ctrl+C</button>' +
				'<button type="button" data-send="\\x1b[A">↑</button>' +
				'<button type="button" data-send="\\x1b[B">↓</button>' +
				'<button type="button" data-send="\\x1b[D">←</button>' +
				'<button type="button" data-send="\\x1b[C">→</button>' +
				'<button type="button" id="legacy-kb">Keyboard</button>' +
				'<button type="button" id="legacy-clear">Clear</button>' +
			'</div>' +
			'<textarea id="legacy-proxy" autocomplete="off" autocorrect="off" ' +
				'autocapitalize="off" spellcheck="false"></textarea>';

		app.innerHTML = headerHtml;
		root.appendChild(app);

		statusEl = document.getElementById('legacy-status');
		termEl = document.getElementById('legacy-term');
		proxyEl = document.getElementById('legacy-proxy');

		term = new LegacyAnsiTerminal({
			cols: size.cols,
			rows: size.rows
		});
		term.attach(termEl);

		function onData (data) {
			term.write(data);
		}

		function onMode (info) {
			var label = 'mode=' + info.mode;

			if (info.usingPty) {
				label += ' · PTY';
			} else if (info.mode === 'native') {
				label += ' · piped';
			}

			if (info.mode === 'native') {
				if (info.isRoot) {
					label += ' · root';
				} else {
					label += ' · prisoner';
					if (info.uid != null) {
						label += ' uid=' + info.uid;
					}
				}
			}

			if (info.mode === 'connecting') {
				label += ' · opening shell service';
			} else if (info.mode === 'homebrew') {
				label += ' · degraded spawn';
			} else if (info.mode === 'error') {
				label += ' · service unavailable';
			}

			setStatus(statusEl, label + ' · ' + size.cols + '×' + size.rows);
		}

		session = new LegacyShellSession({
			cols: size.cols,
			rows: size.rows,
			onData: onData,
			onExit: function (code) {
				term.write('\r\n\x1b[33m[shell exited: ' + code + ']\x1b[0m\r\n');
			},
			onError: function (msg) {
				term.write('\r\n\x1b[31m[error] ' + msg + '\x1b[0m\r\n');
			},
			onMode: onMode
		});

		function send (data) {
			session.write(data);
		}

		// Toolbar special keys (data-send uses JS string escapes in attribute — parse manually)
		var buttons = app.getElementsByTagName('button');
		var bi;

		for (bi = 0; bi < buttons.length; bi++) {
			(function (btn) {
				btn.onclick = function (ev) {
					var raw = btn.getAttribute('data-send');

					if (ev && ev.preventDefault) {
						ev.preventDefault();
					}

					if (raw === '\\t') {
						send('\t');
					} else if (raw === '\\x1b') {
						send('\x1b');
					} else if (raw === '\\x03') {
						send('\x03');
					} else if (raw === '\\x1b[A') {
						send('\x1b[A');
					} else if (raw === '\\x1b[B') {
						send('\x1b[B');
					} else if (raw === '\\x1b[C') {
						send('\x1b[C');
					} else if (raw === '\\x1b[D') {
						send('\x1b[D');
					} else if (btn.id === 'legacy-clear') {
						term.clear();
					} else if (btn.id === 'legacy-kb') {
						try {
							proxyEl.focus();
						} catch (err) {
							// ignore
						}
					}

					try {
						termEl.focus();
					} catch (err2) {
						// ignore
					}
				};
			}(buttons[bi]));
		}

		// Physical / remote key events on terminal
		termEl.onkeydown = function (ev) {
			var key = ev.keyCode || ev.which;
			var ctrl = ev.ctrlKey || ev.metaKey;

			if (ev.preventDefault) {
				// Always handle — avoid browser chrome
			}

			if (key === 8) {
				send('\x7f');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 9) {
				send('\t');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 13) {
				send('\r');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 27) {
				send('\x1b');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 37) {
				send('\x1b[D');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 38) {
				send('\x1b[A');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 39) {
				send('\x1b[C');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (key === 40) {
				send('\x1b[B');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (ctrl && key === 67) {
				// Ctrl+C
				send('\x03');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			if (ctrl && key === 68) {
				send('\x04');

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			return true;
		};

		termEl.onkeypress = function (ev) {
			var ch;
			var code = ev.charCode || ev.keyCode;

			if (ev.which === 0 || ev.ctrlKey || ev.altKey || ev.metaKey) {
				return true;
			}

			if (code === 13 || code === 8 || code === 9) {
				return false;
			}

			if (code >= 32) {
				ch = String.fromCharCode(code);
				send(ch);

				if (ev.preventDefault) {
					ev.preventDefault();
				}

				return false;
			}

			return true;
		};

		// On-screen keyboard via hidden textarea (webOS VKB)
		var proxyLen = 0;

		proxyEl.onfocus = function () {
			proxyEl.value = '';
			proxyLen = 0;
		};

		proxyEl.oninput = proxyEl.onkeyup = function () {
			var val = proxyEl.value || '';
			var delta;

			if (val.length > proxyLen) {
				delta = val.substring(proxyLen);
				// Map newlines from VKB Enter
				delta = delta.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
				send(delta);
			} else if (val.length < proxyLen) {
				// backspace(s)
				var n = proxyLen - val.length;
				var j;

				for (j = 0; j < n; j++) {
					send('\x7f');
				}
			}

			proxyLen = val.length;

			// Prevent unbounded growth
			if (proxyLen > 200) {
				proxyEl.value = '';
				proxyLen = 0;
			}
		};

		termEl.onclick = function () {
			try {
				termEl.focus();
				proxyEl.focus();
			} catch (err) {
				// ignore
			}
		};

		// Focus for remote
		try {
			termEl.focus();
		} catch (err) {
			// ignore
		}

		// Best-effort resize on orientation / window change
		var resizeTimer = null;

		function onResize () {
			if (resizeTimer) {
				clearTimeout(resizeTimer);
			}

			resizeTimer = setTimeout(function () {
				var next = estimateSize();

				if (next.cols !== size.cols || next.rows !== size.rows) {
					size = next;
					term.resize(size.cols, size.rows);
					session.resize(size.cols, size.rows);
					onMode({
						mode: session.mode,
						usingPty: session.usingPty,
						raw: session.usesRawInput()
					});
				}
			}, 200);
		}

		if (window.addEventListener) {
			window.addEventListener('resize', onResize, false);
		} else if (window.attachEvent) {
			window.attachEvent('onresize', onResize);
		}

		// Close shell when app is hidden if PalmSystem is available
		if (window.PalmSystem && typeof window.PalmSystem.stageReady === 'function') {
			try {
				window.PalmSystem.stageReady();
			} catch (err2) {
				// ignore
			}
		}

		return {
			term: term,
			session: session
		};
	}

	function start () {
		var root = document.getElementById('root');

		if (!root) {
			root = document.createElement('div');
			root.id = 'root';
			document.body.appendChild(root);
		}

		return mount(root);
	}

	return {
		start: start,
		BANNER: BANNER
	};
}());
