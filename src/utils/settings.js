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

export const FONT_FAMILY_OPTIONS = [
	{
		id: 'monospace',
		label: 'System Monospace',
		family: 'monospace',
		bundled: false,
		description: 'Your TV\'s built-in fixed-width font'
	},
	{
		id: 'jetbrains',
		label: 'JetBrains Mono',
		family: '"JetBrains Mono", monospace',
		bundled: true,
		description: 'Designed for long coding sessions'
	},
	{
		id: 'ibm-plex',
		label: 'IBM Plex Mono',
		family: '"IBM Plex Mono", monospace',
		bundled: true,
		description: 'Crisp and readable at every size'
	},
	{
		id: 'cascadia',
		label: 'Cascadia Mono',
		family: '"Cascadia Mono", monospace',
		bundled: true,
		description: 'The Windows Terminal typeface'
	},
	{
		id: 'dejavu',
		label: 'DejaVu Sans Mono',
		family: '"DejaVu Mono", monospace',
		bundled: true,
		description: 'Broad Unicode and symbol coverage'
	},
	{
		id: 'fira',
		label: 'Fira Mono',
		family: '"Fira Mono", monospace',
		bundled: true,
		description: 'Humanist monospace with open forms'
	}
];

const LEGACY_FONT_IDS = {
	liberation: 'dejavu',
	courier: 'monospace',
	'courier-new': 'monospace',
	'source-code': 'jetbrains'
};
export const DEFAULT_FONT_FAMILY = 'monospace';

export const DEFAULT_AUTOMATION_PASSWORD = 'webos';

export function normalizeAutomationPassword (password) {
	if (typeof password !== 'string') {
		return DEFAULT_AUTOMATION_PASSWORD;
	}

	const trimmed = password.trim();

	return trimmed || DEFAULT_AUTOMATION_PASSWORD;
}

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

export function normalizeFontFamily (fontFamily) {
	const normalizedId = LEGACY_FONT_IDS[fontFamily] || fontFamily;
	const match = FONT_FAMILY_OPTIONS.find((option) => option.id === normalizedId);

	return match ? match.id : DEFAULT_FONT_FAMILY;
}

export const defaultSettings = {
	keyboardMode: KEYBOARD_MODES.AUTO,
	terminalRows: DEFAULT_TERMINAL_ROWS,
	fontSize: DEFAULT_FONT_SIZE,
	fontFamily: DEFAULT_FONT_FAMILY,
	automationPassword: DEFAULT_AUTOMATION_PASSWORD
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

		const parsed = JSON.parse(raw);
		const stored = {...defaultSettings, ...parsed};

		stored.terminalRows = clampTerminalRows(stored.terminalRows);
		stored.fontSize = clampFontSize(stored.fontSize);
		stored.fontFamily = normalizeFontFamily(
			typeof parsed.fontFamily === 'string' ? parsed.fontFamily : defaultSettings.fontFamily
		);
		stored.automationPassword = normalizeAutomationPassword(stored.automationPassword);

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