// Polyfills for DOM/JS APIs used by third-party deps (e.g. @xterm/xterm) that
// are missing on older Chromium engines found on some webOS TVs (e.g. the
// UP7550PTC on webOS 6.5.3). This must be imported before any code that uses
// these APIs runs.

if (typeof window !== 'undefined') {
	// Element.prototype.replaceChildren - Chrome 86+. xterm's DOM renderer
	// calls this on row elements; without it, rendering throws
	// "replaceChildren is not a function" and the app never starts.
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
