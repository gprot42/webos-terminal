/**
 * Shared DOM/JS shims used by more than one legacy tier.
 *
 * RINGFENCE: Only import from src/compat/legacy/* or polyfill dispatchers.
 * Do not import from App / views / services.
 */

/* eslint-disable no-extend-native */

export function polyfillReplaceChildren () {
	if (typeof window === 'undefined') {
		return;
	}

	[window.Element, window.DocumentFragment].forEach((ctor) => {
		if (ctor && !ctor.prototype.replaceChildren) {
			ctor.prototype.replaceChildren = function () {
				while (this.firstChild) {
					this.removeChild(this.firstChild);
				}

				const nodes = Array.prototype.slice.call(arguments);

				for (let i = 0; i < nodes.length; i++) {
					const node = nodes[i];

					this.appendChild(
						typeof node === 'string' ? document.createTextNode(node) : node
					);
				}
			};
		}
	});
}

export function polyfillObjectAssign () {
	if (typeof Object.assign === 'function') {
		return;
	}

	Object.assign = function (target) {
		if (target == null) {
			throw new TypeError('Cannot convert undefined or null to object');
		}

		const to = Object(target);

		for (let i = 1; i < arguments.length; i++) {
			const source = arguments[i];

			if (source != null) {
				for (const key in source) {
					if (Object.prototype.hasOwnProperty.call(source, key)) {
						to[key] = source[key];
					}
				}
			}
		}

		return to;
	};
}

export function polyfillArrayFrom () {
	if (typeof Array.from === 'function') {
		return;
	}

	Array.from = function (arrayLike, mapFn, thisArg) {
		const items = Object(arrayLike);
		const length = items.length >>> 0;
		const result = new Array(length);

		for (let i = 0; i < length; i++) {
			const value = items[i];

			result[i] = typeof mapFn === 'function' ? mapFn.call(thisArg, value, i) : value;
		}

		return result;
	};
}

export function polyfillStringSearchHelpers () {
	if (!String.prototype.startsWith) {
		String.prototype.startsWith = function (search, pos) {
			const start = pos >> 0;

			return this.substring(start, start + search.length) === search;
		};
	}

	if (!String.prototype.endsWith) {
		String.prototype.endsWith = function (search, length) {
			const end = length === undefined || length > this.length ? this.length : length;

			return this.substring(end - search.length, end) === search;
		};
	}

	if (!String.prototype.includes) {
		String.prototype.includes = function (search, start) {
			if (typeof start !== 'number') {
				start = 0;
			}

			return this.indexOf(search, start) !== -1;
		};
	}
}
