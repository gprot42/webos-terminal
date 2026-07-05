// Lightweight tab/session restore across app restarts. Only tab count,
// order, the active tab, and each tab's last known working directory are
// remembered -- scrollback and any running foreground program are not
// restored (see README/plan for rationale).

const STORAGE_KEY = 'webos-terminal-tabs';
const SAVE_DEBOUNCE_MS = 500;

let saveTimer = null;

export function loadTabState () {
	if (typeof window === 'undefined' || !window.localStorage) {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.tabs) || !parsed.tabs.length) {
			return null;
		}

		return parsed;
	} catch (err) {
		return null;
	}
}

function writeTabState (state) {
	if (typeof window === 'undefined' || !window.localStorage) {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		// storage unavailable/full -- persistence is best-effort
	}
}

export function saveTabState (state) {
	if (saveTimer) {
		window.clearTimeout(saveTimer);
	}

	saveTimer = window.setTimeout(() => {
		saveTimer = null;
		writeTabState(state);
	}, SAVE_DEBOUNCE_MS);
}

export function saveTabStateNow (state) {
	if (saveTimer) {
		window.clearTimeout(saveTimer);
		saveTimer = null;
	}

	writeTabState(state);
}
