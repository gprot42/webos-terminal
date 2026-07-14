/**
 * webOS 3.x polyfills (Chromium 38 / QtWebEngine).
 *
 * RINGFENCE: All Chrome-38-only work lives under src/compat/legacy/webos3/.
 * The webOS 4+ path uses src/compat/polyfills/modern.js and must not grow
 * these shims. Import only via src/compat/polyfills/index.js.
 *
 * Goal: make the shared React + xterm bundle parse and boot far enough to
 * open a terminal. Syntax is handled by browserslist + downlevel-syntax
 * (chrome 38). This file covers runtime APIs Chrome 38 lacks that our deps
 * touch (globalThis, queueMicrotask, Object.values, ResizeObserver, …).
 */

/* eslint-disable no-extend-native */

import {
	polyfillArrayFrom,
	polyfillObjectAssign,
	polyfillReplaceChildren,
	polyfillStringSearchHelpers
} from '../shared';

function polyfillGlobalThis () {
	if (typeof globalThis !== 'undefined') {
		return;
	}

	const getGlobal = function () {
		if (typeof window !== 'undefined') {
			return window;
		}

		// Worker / non-window global (not expected on webOS TV apps).
		if (typeof global !== 'undefined') {
			return global;
		}

		throw new Error('globalThis polyfill: unable to locate global object');
	};

	const g = getGlobal();

	try {
		Object.defineProperty(g, 'globalThis', {
			configurable: true,
			enumerable: false,
			writable: true,
			value: g
		});
	} catch (err) {
		g.globalThis = g;
	}
}

function polyfillQueueMicrotask () {
	if (typeof queueMicrotask === 'function') {
		return;
	}

	const g = typeof globalThis !== 'undefined' ? globalThis : window;

	g.queueMicrotask = function (callback) {
		Promise.resolve()
			.then(callback)
			.catch(function (err) {
				setTimeout(function () {
					throw err;
				}, 0);
			});
	};
}

function polyfillObjectValuesEntries () {
	if (typeof Object.values !== 'function') {
		Object.values = function (obj) {
			const keys = Object.keys(obj);
			const out = new Array(keys.length);

			for (let i = 0; i < keys.length; i++) {
				out[i] = obj[keys[i]];
			}

			return out;
		};
	}

	if (typeof Object.entries !== 'function') {
		Object.entries = function (obj) {
			const keys = Object.keys(obj);
			const out = new Array(keys.length);

			for (let i = 0; i < keys.length; i++) {
				out[i] = [keys[i], obj[keys[i]]];
			}

			return out;
		};
	}

	if (typeof Object.fromEntries !== 'function') {
		Object.fromEntries = function (iterable) {
			const obj = {};
			const list = Array.from(iterable);

			for (let i = 0; i < list.length; i++) {
				const entry = list[i];

				if (entry) {
					obj[entry[0]] = entry[1];
				}
			}

			return obj;
		};
	}
}

function polyfillArrayExtras () {
	if (!Array.prototype.includes) {
		Array.prototype.includes = function (search, fromIndex) {
			const o = Object(this);
			const len = o.length >>> 0;

			if (len === 0) {
				return false;
			}

			let n = fromIndex | 0;
			let k = n >= 0 ? n : Math.max(len + n, 0);

			while (k < len) {
				const item = o[k];

				if (item === search || (typeof item === 'number' && typeof search === 'number' && isNaN(item) && isNaN(search))) {
					return true;
				}

				k++;
			}

			return false;
		};
	}

	if (!Array.prototype.find) {
		Array.prototype.find = function (predicate, thisArg) {
			const o = Object(this);
			const len = o.length >>> 0;

			for (let i = 0; i < len; i++) {
				const value = o[i];

				if (predicate.call(thisArg, value, i, o)) {
					return value;
				}
			}

			return undefined;
		};
	}

	if (!Array.prototype.findIndex) {
		Array.prototype.findIndex = function (predicate, thisArg) {
			const o = Object(this);
			const len = o.length >>> 0;

			for (let i = 0; i < len; i++) {
				if (predicate.call(thisArg, o[i], i, o)) {
					return i;
				}
			}

			return -1;
		};
	}

	if (!Array.prototype.fill) {
		Array.prototype.fill = function (value, start, end) {
			const o = Object(this);
			const len = o.length >>> 0;
			let relativeStart = start >> 0;
			let k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);
			let relativeEnd = end === undefined ? len : end >> 0;
			const final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

			while (k < final) {
				o[k] = value;
				k++;
			}

			return o;
		};
	}

	if (!Array.prototype.flat) {
		Array.prototype.flat = function (depth) {
			const d = depth === undefined ? 1 : Number(depth);
			const result = [];

			(function flatten (arr, currentDepth) {
				for (let i = 0; i < arr.length; i++) {
					const value = arr[i];

					if (Array.isArray(value) && currentDepth < d) {
						flatten(value, currentDepth + 1);
					} else {
						result.push(value);
					}
				}
			})(Object(this), 0);

			return result;
		};
	}

	if (!Array.prototype.flatMap) {
		Array.prototype.flatMap = function (callback, thisArg) {
			return Array.prototype.map.call(this, callback, thisArg).flat();
		};
	}
}

function polyfillStringPad () {
	if (!String.prototype.padStart) {
		String.prototype.padStart = function (targetLength, padString) {
			const str = String(this);
			let len = targetLength >> 0;
			let pad = padString === undefined ? ' ' : String(padString);

			if (str.length >= len || pad.length === 0) {
				return str;
			}

			len = len - str.length;

			while (pad.length < len) {
				pad += pad;
			}

			return pad.slice(0, len) + str;
		};
	}

	if (!String.prototype.padEnd) {
		String.prototype.padEnd = function (targetLength, padString) {
			const str = String(this);
			let len = targetLength >> 0;
			let pad = padString === undefined ? ' ' : String(padString);

			if (str.length >= len || pad.length === 0) {
				return str;
			}

			len = len - str.length;

			while (pad.length < len) {
				pad += pad;
			}

			return str + pad.slice(0, len);
		};
	}

	if (!String.prototype.repeat) {
		String.prototype.repeat = function (count) {
			if (this == null) {
				throw new TypeError("can't convert " + this + ' to object');
			}

			let str = String(this);
			let n = count >> 0;

			if (n < 0 || n === Infinity) {
				throw new RangeError('Invalid count value');
			}

			let result = '';

			while (n > 0) {
				if (n & 1) {
					result += str;
				}

				n >>= 1;

				if (n) {
					str += str;
				}
			}

			return result;
		};
	}
}

function polyfillPromiseFinally () {
	if (typeof Promise === 'undefined' || typeof Promise.prototype.finally === 'function') {
		return;
	}

	Promise.prototype.finally = function (onFinally) {
		const P = this.constructor;

		return this.then(
			function (value) {
				return P.resolve(typeof onFinally === 'function' ? onFinally() : onFinally).then(function () {
					return value;
				});
			},
			function (reason) {
				return P.resolve(typeof onFinally === 'function' ? onFinally() : onFinally).then(function () {
					throw reason;
				});
			}
		);
	};
}

function polyfillElementTraversal () {
	if (typeof window === 'undefined' || !window.Element) {
		return;
	}

	const proto = window.Element.prototype;

	if (!proto.remove) {
		proto.remove = function () {
			if (this.parentNode) {
				this.parentNode.removeChild(this);
			}
		};
	}

	if (!proto.append) {
		proto.append = function () {
			const nodes = Array.prototype.slice.call(arguments);

			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];

				this.appendChild(
					typeof node === 'string' ? document.createTextNode(node) : node
				);
			}
		};
	}

	if (!proto.prepend) {
		proto.prepend = function () {
			const nodes = Array.prototype.slice.call(arguments);
			const first = this.firstChild;

			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				const child = typeof node === 'string' ? document.createTextNode(node) : node;

				this.insertBefore(child, first);
			}
		};
	}

	if (window.DocumentFragment && !window.DocumentFragment.prototype.append) {
		window.DocumentFragment.prototype.append = proto.append;
		window.DocumentFragment.prototype.prepend = proto.prepend;
	}

	if (window.CharacterData && !window.CharacterData.prototype.remove) {
		window.CharacterData.prototype.remove = proto.remove;
	}

	if (window.DocumentType && !window.DocumentType.prototype.remove) {
		window.DocumentType.prototype.remove = proto.remove;
	}
}

/**
 * Minimal ResizeObserver for xterm FitAddon / TerminalView.
 * Not a full RO polyfill — enough to fire on window resize and observe calls.
 */
function polyfillResizeObserver () {
	if (typeof window === 'undefined' || typeof window.ResizeObserver === 'function') {
		return;
	}

	window.ResizeObserver = function (callback) {
		this._callback = callback;
		this._targets = [];
		this._bound = this._onResize.bind(this);
	};

	window.ResizeObserver.prototype.observe = function (target) {
		if (this._targets.indexOf(target) === -1) {
			this._targets.push(target);
		}

		if (this._targets.length === 1) {
			window.addEventListener('resize', this._bound);
			// Initial notification after layout.
			const self = this;

			setTimeout(function () {
				self._onResize();
			}, 0);
		}
	};

	window.ResizeObserver.prototype.unobserve = function (target) {
		const idx = this._targets.indexOf(target);

		if (idx !== -1) {
			this._targets.splice(idx, 1);
		}

		if (this._targets.length === 0) {
			window.removeEventListener('resize', this._bound);
		}
	};

	window.ResizeObserver.prototype.disconnect = function () {
		this._targets = [];
		window.removeEventListener('resize', this._bound);
	};

	window.ResizeObserver.prototype._onResize = function () {
		const entries = [];

		for (let i = 0; i < this._targets.length; i++) {
			const target = this._targets[i];
			const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : {width: 0, height: 0};

			entries.push({
				target: target,
				contentRect: {
					x: 0,
					y: 0,
					width: rect.width,
					height: rect.height,
					top: 0,
					left: 0,
					bottom: rect.height,
					right: rect.width
				}
			});
		}

		if (entries.length && typeof this._callback === 'function') {
			this._callback(entries, this);
		}
	};
}

function polyfillNumberIsFiniteIsNaN () {
	if (typeof Number.isNaN !== 'function') {
		Number.isNaN = function (value) {
			return typeof value === 'number' && isNaN(value);
		};
	}

	if (typeof Number.isFinite !== 'function') {
		Number.isFinite = function (value) {
			return typeof value === 'number' && isFinite(value);
		};
	}

	if (typeof Number.isInteger !== 'function') {
		Number.isInteger = function (value) {
			return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
		};
	}
}

export function applyWebOS3Polyfills () {
	if (typeof window === 'undefined') {
		return;
	}

	// Order matters: globalThis first so later shims can attach cleanly.
	polyfillGlobalThis();
	polyfillObjectAssign();
	polyfillArrayFrom();
	polyfillStringSearchHelpers();
	polyfillObjectValuesEntries();
	polyfillArrayExtras();
	polyfillStringPad();
	polyfillPromiseFinally();
	polyfillQueueMicrotask();
	polyfillNumberIsFiniteIsNaN();
	polyfillElementTraversal();
	polyfillReplaceChildren();
	polyfillResizeObserver();
}
