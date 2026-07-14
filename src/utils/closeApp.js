import {platformBack} from '@enact/webos/application';

import {resumeSpotlightForKeyboard} from './keyboard';

const cleanups = new Set();

export function registerAppCleanup (fn) {
	cleanups.add(fn);

	return () => {
		cleanups.delete(fn);
	};
}

function runCleanups () {
	for (const cleanup of cleanups) {
		try {
			cleanup();
		} catch (err) {
			// Ignore cleanup errors while exiting.
		}
	}

	cleanups.clear();
}

/**
 * Exit the app on webOS.
 *
 * `window.close` exists in Chromium but often no-ops for webOS TV apps. The
 * previous path called it and returned, so cleanup disposed the terminal while
 * the card stayed open — users had to force-quit. Prefer platformBack (native
 * exit / confirm dialog) and still attempt window.close as a secondary path.
 */
export function closeApp () {
	// Unpause Spotlight so exit UI / launcher handoff is not stuck after a VKB session.
	try {
		resumeSpotlightForKeyboard();
	} catch (err) {
		// ignore
	}

	runCleanups();

	const webOSSystem = typeof window !== 'undefined'
		? (window.webOSSystem || window.PalmSystem)
		: null;

	if (webOSSystem && typeof webOSSystem.platformBack === 'function') {
		try {
			webOSSystem.platformBack();
		} catch (err) {
			// Fall through to window.close / platformBack helper.
		}
	} else {
		try {
			platformBack();
		} catch (err) {
			// ignore
		}
	}

	if (typeof window !== 'undefined' && typeof window.close === 'function') {
		try {
			window.close();
		} catch (err) {
			// ignore
		}
	}
}
