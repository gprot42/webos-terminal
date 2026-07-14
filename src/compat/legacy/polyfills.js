/**
 * Legacy polyfill dispatcher.
 *
 * RINGFENCE: webOS 2 (WebKit) and webOS 3 (Chromium 38) stay in separate
 * folders under this tree. Feature code must not import this file.
 */

import {applyWebOS2Polyfills} from './webos2/polyfills';
import {applyWebOS3Polyfills} from './webos3/polyfills';

/**
 * @param {{webOSMajor: number|null, chromeMajor: number|null, engine: string}} platform
 */
export function applyLegacyPolyfills (platform) {
	const major = platform && platform.webOSMajor;
	const chromeMajor = platform && platform.chromeMajor;

	// webOS 3 is Chromium 38 — attempt the fuller shim set so the shared app
	// can boot. Explicit chrome 38–52 (without sdk) also takes this path.
	if (major === 3 || (chromeMajor != null && chromeMajor >= 38 && chromeMajor < 53)) {
		applyWebOS3Polyfills();
		return;
	}

	// webOS 1–2 (WebKit) — minimal shims only.
	applyWebOS2Polyfills();
}
