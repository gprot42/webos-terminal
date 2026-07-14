/**
 * Polyfill entry — chooses modern vs legacy shims based on platform detection.
 *
 * Ringfence:
 *   - webOS 4+  → modern.js (tiny; replaceChildren only today)
 *   - webOS 3   → legacy/webos3 (Chromium 38 attempt)
 *   - webOS 1–2 → legacy/webos2 (WebKit scaffolding only)
 *
 * Keep new webOS 2/3 code out of modern.js and out of App / views / services.
 */

import {detectPlatform} from '../platform';
import {applyLegacyPolyfills} from '../legacy/polyfills';
import {applyModernPolyfills} from './modern';

const platform = detectPlatform();

if (platform.tier === 'webos3' || platform.tier === 'legacy-webkit' || platform.isLegacy) {
	applyLegacyPolyfills(platform);
} else {
	applyModernPolyfills();
}

export {platform};
