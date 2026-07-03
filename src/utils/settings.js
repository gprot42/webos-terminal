const STORAGE_KEY = 'org.webosbrew.terminal.settings';

export const KEYBOARD_MODES = {
	AUTO: 'auto',
	MANUAL: 'manual',
	PHYSICAL: 'physical'
};

export const TERMINAL_ROW_OPTIONS = [12, 16, 20, 24, 28, 32, 36, 40];
export const DEFAULT_TERMINAL_ROWS = 24;
export const MIN_TERMINAL_ROWS = 8;
export const MAX_TERMINAL_ROWS = 48;

export function clampTerminalRows (rows) {
	const value = Number(rows);

	if (!Number.isFinite(value)) {
		return DEFAULT_TERMINAL_ROWS;
	}

	return Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, Math.round(value)));
}

export const defaultSettings = {
	keyboardMode: KEYBOARD_MODES.AUTO,
	terminalRows: DEFAULT_TERMINAL_ROWS
};

export function loadSettings () {
	if (typeof window === 'undefined') {
		return {...defaultSettings};
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);

		if (!raw) {
			return {...defaultSettings};
		}

		const stored = {...defaultSettings, ...JSON.parse(raw)};

		stored.terminalRows = clampTerminalRows(stored.terminalRows);

		return stored;
	} catch (err) {
		return {...defaultSettings};
	}
}

export function saveSettings (settings) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}