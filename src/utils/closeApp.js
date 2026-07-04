import {platformBack} from '@enact/webos/application';

const cleanups = new Set();

export function registerAppCleanup (fn) {
	cleanups.add(fn);

	return () => {
		cleanups.delete(fn);
	};
}

export function closeApp () {
	for (const cleanup of cleanups) {
		try {
			cleanup();
		} catch (err) {
			// Ignore cleanup errors while exiting.
		}
	}

	cleanups.clear();

	if (typeof window !== 'undefined' && typeof window.close === 'function') {
		window.close();
		return;
	}

	platformBack();
}