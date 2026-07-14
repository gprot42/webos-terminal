/**
 * Polyfills for the supported tier: webOS 4+ (Chromium 53+) and modern
 * desktop browsers used for preview.
 *
 * Keep this list short and targeted. Prefer fixing call sites when a single
 * dependency needs one API, rather than polyfilling the entire platform.
 */

export function applyModernPolyfills () {
	if (typeof window === 'undefined') {
		return;
	}

	// Element.prototype.replaceChildren — Chrome 86+. xterm's DOM renderer
	// calls this on row elements; without it, rendering throws
	// "replaceChildren is not a function" and the app never starts
	// (seen on UP7550PTC / webOS 6.5.3).
	[window.Element, window.DocumentFragment].forEach((ctor) => {
		if (ctor && !ctor.prototype.replaceChildren) {
			ctor.prototype.replaceChildren = function (...nodes) {
				while (this.firstChild) {
					this.removeChild(this.firstChild);
				}

				if (nodes.length) {
					this.append(...nodes);
				}
			};
		}
	});
}
