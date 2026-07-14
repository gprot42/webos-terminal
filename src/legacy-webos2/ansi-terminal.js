/**
 * Lightweight ANSI / VT subset terminal for webOS 1–2 WebKit.
 * Supports basic cursor motion, erase, SGR colors, and alt screen (P4).
 * ES5 only.
 */
var LegacyAnsiTerminal = (function () {
	'use strict';

	var DEFAULT_FG = 7;
	var DEFAULT_BG = 0;

	// Approximate xterm 16 colors as CSS hex
	var PALETTE = [
		'#0d1117', '#ff7b72', '#3fb950', '#d29922',
		'#58a6ff', '#bc8cff', '#39c5cf', '#e6edf3',
		'#6e7681', '#ffa198', '#56d364', '#e3b341',
		'#79c0ff', '#d2a8ff', '#56d4dd', '#ffffff'
	];

	function makeCell (ch, fg, bg, bold) {
		return {
			ch: ch || ' ',
			fg: fg == null ? DEFAULT_FG : fg,
			bg: bg == null ? DEFAULT_BG : bg,
			bold: !!bold
		};
	}

	function blankRow (cols, fg, bg, bold) {
		var row = [];
		var i;

		for (i = 0; i < cols; i++) {
			row.push(makeCell(' ', fg, bg, bold));
		}

		return row;
	}

	function cloneRow (row) {
		var out = [];
		var i;

		for (i = 0; i < row.length; i++) {
			out.push({
				ch: row[i].ch,
				fg: row[i].fg,
				bg: row[i].bg,
				bold: row[i].bold
			});
		}

		return out;
	}

	function createBuffer (cols, rows) {
		var lines = [];
		var i;

		for (i = 0; i < rows; i++) {
			lines.push(blankRow(cols, DEFAULT_FG, DEFAULT_BG, false));
		}

		return {
			lines: lines,
			cx: 0,
			cy: 0,
			savedX: 0,
			savedY: 0
		};
	}

	function Terminal (opts) {
		opts = opts || {};
		this.cols = opts.cols || 80;
		this.rows = opts.rows || 24;
		this.scrollbackMax = opts.scrollbackMax || 500;
		this.scrollback = [];
		this.fg = DEFAULT_FG;
		this.bg = DEFAULT_BG;
		this.bold = false;
		this.cursorVisible = true;
		this.normal = createBuffer(this.cols, this.rows);
		this.alt = createBuffer(this.cols, this.rows);
		this.buf = this.normal;
		this.usingAlt = false;
		this._esc = null; // parser state
		this._csi = '';
		this._osc = '';
		this.element = null;
		this._dirty = true;
	}

	Terminal.prototype.attach = function (element) {
		this.element = element;
		this._dirty = true;
		this.render();
	};

	Terminal.prototype.resize = function (cols, rows) {
		var self = this;
		cols = Math.max(20, cols | 0);
		rows = Math.max(8, rows | 0);

		if (cols === this.cols && rows === this.rows) {
			return;
		}

		function resizeBuffer (buf) {
			var newLines = [];
			var y;
			var x;
			var row;
			var cell;

			for (y = 0; y < rows; y++) {
				row = blankRow(cols, DEFAULT_FG, DEFAULT_BG, false);

				if (y < buf.lines.length) {
					for (x = 0; x < cols && x < buf.lines[y].length; x++) {
						cell = buf.lines[y][x];
						row[x] = {
							ch: cell.ch,
							fg: cell.fg,
							bg: cell.bg,
							bold: cell.bold
						};
					}
				}

				newLines.push(row);
			}

			buf.lines = newLines;

			if (buf.cx >= cols) {
				buf.cx = cols - 1;
			}

			if (buf.cy >= rows) {
				buf.cy = rows - 1;
			}
		}

		this.cols = cols;
		this.rows = rows;
		resizeBuffer(this.normal);
		resizeBuffer(this.alt);
		this._dirty = true;
		this.render();
	};

	Terminal.prototype.clear = function () {
		var y;

		for (y = 0; y < this.rows; y++) {
			this.buf.lines[y] = blankRow(this.cols, this.fg, this.bg, this.bold);
		}

		this.buf.cx = 0;
		this.buf.cy = 0;
		this._dirty = true;
		this.render();
	};

	Terminal.prototype._scrollUp = function () {
		var dropped = this.buf.lines.shift();

		if (!this.usingAlt) {
			this.scrollback.push(cloneRow(dropped));

			if (this.scrollback.length > this.scrollbackMax) {
				this.scrollback.shift();
			}
		}

		this.buf.lines.push(blankRow(this.cols, this.fg, this.bg, this.bold));
	};

	Terminal.prototype._putChar = function (ch) {
		var buf = this.buf;

		if (buf.cx >= this.cols) {
			buf.cx = 0;
			buf.cy += 1;

			if (buf.cy >= this.rows) {
				buf.cy = this.rows - 1;
				this._scrollUp();
			}
		}

		buf.lines[buf.cy][buf.cx] = makeCell(ch, this.fg, this.bg, this.bold);
		buf.cx += 1;
	};

	Terminal.prototype._carriageReturn = function () {
		this.buf.cx = 0;
	};

	Terminal.prototype._lineFeed = function () {
		this.buf.cy += 1;

		if (this.buf.cy >= this.rows) {
			this.buf.cy = this.rows - 1;
			this._scrollUp();
		}
	};

	Terminal.prototype._backspace = function () {
		if (this.buf.cx > 0) {
			this.buf.cx -= 1;
		}
	};

	Terminal.prototype._tab = function () {
		var next = (Math.floor(this.buf.cx / 8) + 1) * 8;

		if (next >= this.cols) {
			next = this.cols - 1;
		}

		while (this.buf.cx < next) {
			this._putChar(' ');
		}
	};

	Terminal.prototype._clampCursor = function () {
		if (this.buf.cx < 0) {
			this.buf.cx = 0;
		}

		if (this.buf.cy < 0) {
			this.buf.cy = 0;
		}

		if (this.buf.cx >= this.cols) {
			this.buf.cx = this.cols - 1;
		}

		if (this.buf.cy >= this.rows) {
			this.buf.cy = this.rows - 1;
		}
	};

	Terminal.prototype._eraseInLine = function (mode) {
		var row = this.buf.lines[this.buf.cy];
		var x;
		var start = 0;
		var end = this.cols;

		if (mode === 1) {
			end = this.buf.cx + 1;
		} else if (mode === 2) {
			start = 0;
			end = this.cols;
		} else {
			// 0 default: cursor to end
			start = this.buf.cx;
			end = this.cols;
		}

		for (x = start; x < end; x++) {
			row[x] = makeCell(' ', this.fg, this.bg, this.bold);
		}
	};

	Terminal.prototype._eraseInDisplay = function (mode) {
		var y;
		var x;

		if (mode === 2 || mode === 3) {
			for (y = 0; y < this.rows; y++) {
				this.buf.lines[y] = blankRow(this.cols, this.fg, this.bg, this.bold);
			}

			if (mode === 3) {
				this.scrollback = [];
			}

			return;
		}

		if (mode === 1) {
			for (y = 0; y < this.buf.cy; y++) {
				this.buf.lines[y] = blankRow(this.cols, this.fg, this.bg, this.bold);
			}

			for (x = 0; x <= this.buf.cx; x++) {
				this.buf.lines[this.buf.cy][x] = makeCell(' ', this.fg, this.bg, this.bold);
			}

			return;
		}

		// 0: cursor to end of screen
		this._eraseInLine(0);

		for (y = this.buf.cy + 1; y < this.rows; y++) {
			this.buf.lines[y] = blankRow(this.cols, this.fg, this.bg, this.bold);
		}
	};

	Terminal.prototype._applySgr = function (params) {
		var i;
		var p;

		if (!params.length) {
			params = [0];
		}

		for (i = 0; i < params.length; i++) {
			p = params[i];

			if (p === 0) {
				this.fg = DEFAULT_FG;
				this.bg = DEFAULT_BG;
				this.bold = false;
			} else if (p === 1) {
				this.bold = true;
			} else if (p === 22) {
				this.bold = false;
			} else if (p === 39) {
				this.fg = DEFAULT_FG;
			} else if (p === 49) {
				this.bg = DEFAULT_BG;
			} else if (p >= 30 && p <= 37) {
				this.fg = p - 30;
			} else if (p >= 90 && p <= 97) {
				this.fg = p - 90 + 8;
			} else if (p >= 40 && p <= 47) {
				this.bg = p - 40;
			} else if (p >= 100 && p <= 107) {
				this.bg = p - 100 + 8;
			} else if (p === 38 && params[i + 1] === 5 && params[i + 2] != null) {
				// 256-color fg — map roughly into 16
				this.fg = params[i + 2] % 16;
				i += 2;
			} else if (p === 48 && params[i + 1] === 5 && params[i + 2] != null) {
				this.bg = params[i + 2] % 16;
				i += 2;
			}
		}
	};

	Terminal.prototype._parseParams = function (str) {
		var parts;
		var out = [];
		var i;
		var n;

		if (!str) {
			return [];
		}

		parts = str.split(';');

		for (i = 0; i < parts.length; i++) {
			if (parts[i] === '') {
				out.push(0);
			} else {
				n = parseInt(parts[i], 10);
				out.push(isNaN(n) ? 0 : n);
			}
		}

		return out;
	};

	Terminal.prototype._handleCsi = function (paramsStr, intermediate, final) {
		var params = this._parseParams(paramsStr);
		var n = params.length ? params[0] : 0;
		var m = params.length > 1 ? params[1] : 0;
		var buf = this.buf;

		if (final === 'A') {
			buf.cy -= n || 1;
		} else if (final === 'B') {
			buf.cy += n || 1;
		} else if (final === 'C') {
			buf.cx += n || 1;
		} else if (final === 'D') {
			buf.cx -= n || 1;
		} else if (final === 'G') {
			buf.cx = Math.max(0, (n || 1) - 1);
		} else if (final === 'H' || final === 'f') {
			buf.cy = Math.max(0, (n || 1) - 1);
			buf.cx = Math.max(0, (m || 1) - 1);
		} else if (final === 'J') {
			this._eraseInDisplay(n || 0);
		} else if (final === 'K') {
			this._eraseInLine(n || 0);
		} else if (final === 'm') {
			this._applySgr(params);
		} else if (final === 's') {
			buf.savedX = buf.cx;
			buf.savedY = buf.cy;
		} else if (final === 'u') {
			buf.cx = buf.savedX;
			buf.cy = buf.savedY;
		} else if (final === 'h' && intermediate === '?' ) {
			// DEC private modes set
			if (n === 25) {
				this.cursorVisible = true;
			} else if (n === 1049 || n === 47 || n === 1047) {
				this._enterAlt();
			}
		} else if (final === 'l' && intermediate === '?') {
			if (n === 25) {
				this.cursorVisible = false;
			} else if (n === 1049 || n === 47 || n === 1047) {
				this._leaveAlt();
			}
		} else if (final === 'n') {
			// device status — ignore
		}

		this._clampCursor();
	};

	Terminal.prototype._enterAlt = function () {
		if (this.usingAlt) {
			return;
		}

		this.usingAlt = true;
		this.buf = this.alt;
		this.clear();
	};

	Terminal.prototype._leaveAlt = function () {
		if (!this.usingAlt) {
			return;
		}

		this.usingAlt = false;
		this.buf = this.normal;
	};

	Terminal.prototype.write = function (text) {
		var i;
		var ch;
		var code;

		if (!text) {
			return;
		}

		text = String(text);

		for (i = 0; i < text.length; i++) {
			ch = text.charAt(i);
			code = text.charCodeAt(i);

			if (this._esc === 'esc') {
				if (ch === '[') {
					this._esc = 'csi';
					this._csi = '';
					this._csiInt = '';
				} else if (ch === ']') {
					this._esc = 'osc';
					this._osc = '';
				} else if (ch === '7') {
					this.buf.savedX = this.buf.cx;
					this.buf.savedY = this.buf.cy;
					this._esc = null;
				} else if (ch === '8') {
					this.buf.cx = this.buf.savedX;
					this.buf.cy = this.buf.savedY;
					this._esc = null;
				} else if (ch === 'c') {
					// RIS reset
					this.fg = DEFAULT_FG;
					this.bg = DEFAULT_BG;
					this.bold = false;
					this._leaveAlt();
					this.clear();
					this._esc = null;
				} else if (ch === 'D') {
					this._lineFeed();
					this._esc = null;
				} else if (ch === 'M') {
					// reverse index
					if (this.buf.cy > 0) {
						this.buf.cy -= 1;
					}

					this._esc = null;
				} else if (ch === 'E') {
					this._carriageReturn();
					this._lineFeed();
					this._esc = null;
				} else {
					this._esc = null;
				}

				continue;
			}

			if (this._esc === 'csi') {
				if (ch >= '0' && ch <= '9' || ch === ';') {
					this._csi += ch;
				} else if (ch === '?') {
					this._csiInt = '?';
				} else if (ch >= ' ' && ch <= '/') {
					this._csiInt = (this._csiInt || '') + ch;
				} else if (ch >= '@' && ch <= '~') {
					this._handleCsi(this._csi, this._csiInt || '', ch);
					this._esc = null;
					this._csi = '';
					this._csiInt = '';
				} else {
					this._esc = null;
				}

				continue;
			}

			if (this._esc === 'osc') {
				// BEL or ST ends OSC
				if (code === 7 || (this._osc.length && this._osc.charAt(this._osc.length - 1) === '\x1b' && ch === '\\')) {
					this._esc = null;
					this._osc = '';
				} else {
					this._osc += ch;
				}

				continue;
			}

			if (code === 27) {
				this._esc = 'esc';
				continue;
			}

			if (ch === '\r') {
				this._carriageReturn();
			} else if (ch === '\n') {
				this._lineFeed();
			} else if (ch === '\b') {
				this._backspace();
			} else if (ch === '\t') {
				this._tab();
			} else if (code === 0 || code === 7) {
				// NUL / BEL — ignore
			} else if (code >= 32) {
				this._putChar(ch);
			}
		}

		this._dirty = true;
		this.render();
	};

	Terminal.prototype._escapeHtml = function (s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	};

	Terminal.prototype.render = function () {
		var html = [];
		var y;
		var x;
		var row;
		var cell;
		var prevKey = null;
		var open = false;
		var key;
		var style;
		var isCursor;
		var ch;

		if (!this.element || !this._dirty) {
			return;
		}

		for (y = 0; y < this.rows; y++) {
			html.push('<span class="row">');
			row = this.buf.lines[y];
			prevKey = null;
			open = false;

			for (x = 0; x < this.cols; x++) {
				cell = row[x] || makeCell(' ', DEFAULT_FG, DEFAULT_BG, false);
				isCursor = this.cursorVisible && x === this.buf.cx && y === this.buf.cy;
				key = cell.fg + ',' + cell.bg + ',' + (cell.bold ? 1 : 0) + ',' + (isCursor ? 1 : 0);

				if (key !== prevKey) {
					if (open) {
						html.push('</span>');
					}

					style = 'color:' + PALETTE[cell.fg % 16] + ';';

					if (cell.bg) {
						style += 'background:' + PALETTE[cell.bg % 16] + ';';
					}

					if (cell.bold) {
						style += 'font-weight:bold;';
					}

					if (isCursor) {
						html.push('<span class="cell cursor" style="' + style + '">');
					} else {
						html.push('<span class="cell" style="' + style + '">');
					}

					open = true;
					prevKey = key;
				}

				ch = cell.ch;

				if (ch === ' ') {
					html.push('&nbsp;');
				} else {
					html.push(this._escapeHtml(ch));
				}
			}

			if (open) {
				html.push('</span>');
			}

			html.push('</span>');
		}

		this.element.innerHTML = html.join('');
		this._dirty = false;
	};

	return Terminal;
}());
