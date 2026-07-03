import {platformBack} from '@enact/webos/application';

let cleanup = null;

export function registerAppCleanup (fn) {
	cleanup = fn;
}

export function closeApp () {
	try {
		cleanup?.();
	} catch (err) {
		// Ignore cleanup errors while exiting.
	}

	if (typeof window !== 'undefined' && typeof window.close === 'function') {
		window.close();
		return;
	}

	platformBack();
}