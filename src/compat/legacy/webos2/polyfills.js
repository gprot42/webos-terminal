/**
 * webOS 1–2 polyfills (WebKit 537–538).
 *
 * RINGFENCE: webOS 2 is pre-Chromium. The shipping UI for these devices is the
 * separate cut-down shell in src/legacy-webos2/ (dual-boot loader), not React.
 * These shims remain only if any shared modern bootstrap ever touches WebKit.
 *
 * Import only via src/compat/polyfills/index.js.
 */

import {
	polyfillArrayFrom,
	polyfillObjectAssign,
	polyfillReplaceChildren,
	polyfillStringSearchHelpers
} from '../shared';

export function applyWebOS2Polyfills () {
	if (typeof window === 'undefined') {
		return;
	}

	polyfillObjectAssign();
	polyfillArrayFrom();
	polyfillStringSearchHelpers();
	polyfillReplaceChildren();
}
