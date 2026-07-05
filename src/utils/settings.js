const STORAGE_KEY = 'com.github.gprot42.webosterminal.settings';

export const KEYBOARD_MODES = {
	AUTO: 'auto',
	MANUAL: 'manual',
	PHYSICAL: 'physical'
};

export const TERMINAL_ROW_OPTIONS = [12, 16, 20, 24, 28, 32, 36, 40];
export const DEFAULT_TERMINAL_ROWS = 24;
export const MIN_TERMINAL_ROWS = 8;
export const MAX_TERMINAL_ROWS = 48;

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32];
export const DEFAULT_FONT_SIZE = 18;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;

export function clampTerminalRows (rows) {
	const value = Number(rows);

	if (!Number.isFinite(value)) {
		return DEFAULT_TERMINAL_ROWS;
	}

	return Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, Math.round(value)));
}

export function clampFontSize (size) {
	const value = Number(size);

	if (!Number.isFinite(value)) {
		return DEFAULT_FONT_SIZE;
	}

	return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
}

export const defaultSettings = {
	keyboardMode: KEYBOARD_MODES.AUTO,
	terminalRows: DEFAULT_TERMINAL_ROWS,
	fontSize: DEFAULT_FONT_SIZE
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
		stored.fontSize = clampFontSize(stored.fontSize);

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