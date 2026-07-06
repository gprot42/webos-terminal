import {
	DEFAULT_FONT_FAMILY,
	FONT_FAMILY_OPTIONS,
	normalizeFontFamily
} from './settings';

export const FONT_PREVIEW_GLYPH_GROUPS = [
	{label: '0 / O', chars: '0O'},
	{label: 'l / 1 / I', chars: 'Il1'},
	{label: 'Box draw', chars: '│─┌┐'},
	{label: 'Symbols', chars: '@#$%&'}
];

export const FONT_PREVIEW_TERMINAL_LINES = [
	'$ ls -la',
	'total 42',
	'drwxr-xr-x  webos  home'
];

const LEGACY_FONT_IDS = {
	liberation: 'dejavu',
	courier: 'monospace',
	'courier-new': 'monospace',
	'source-code': 'jetbrains'
};

const SYSTEM_MONOSPACE_CANDIDATES = [
	'LG Smart Mono',
	'Liberation Mono',
	'Nimbus Mono L',
	'Noto Sans Mono',
	'Noto Mono',
	'Droid Sans Mono',
	'Roboto Mono',
	'Ubuntu Mono',
	'Consolas',
	'Menlo',
	'Monaco',
	'SF Mono',
	'SFMono-Regular',
	'Courier New',
	'Courier'
];

const SAMPLE_TEXT = 'mmmmmmmmmmlli';
const MEASURE_SIZE = '72px';

const BUNDLED_FONT_NAMES = new Set(
	FONT_FAMILY_OPTIONS
		.filter((option) => option.bundled)
		.map((option) => getPrimaryFamilyName(option.family))
);

let baselineWidth;
let resolvedSystemMonospaceStack;

function getBaselineWidth () {
	if (baselineWidth == null && typeof document !== 'undefined') {
		baselineWidth = measureFontWidth('monospace');
	}

	return baselineWidth || 0;
}

function measureFontWidth (familyStack) {
	if (typeof document === 'undefined') {
		return 0;
	}

	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

	context.font = `${MEASURE_SIZE} ${familyStack}`;

	return context.measureText(SAMPLE_TEXT).width;
}

function getPrimaryFamilyName (familyStack) {
	return familyStack
		.split(',')[0]
		.trim()
		.replace(/^["']|["']$/g, '');
}

export function resolveSystemMonospaceStack () {
	if (resolvedSystemMonospaceStack) {
		return resolvedSystemMonospaceStack;
	}

	if (typeof document === 'undefined') {
		resolvedSystemMonospaceStack = 'monospace';
		return resolvedSystemMonospaceStack;
	}

	const baseline = getBaselineWidth();

	for (const candidate of SYSTEM_MONOSPACE_CANDIDATES) {
		if (BUNDLED_FONT_NAMES.has(candidate)) {
			continue;
		}

		const width = measureFontWidth(`"${candidate}"`);

		if (Math.abs(width - baseline) < 0.01) {
			resolvedSystemMonospaceStack = `"${candidate}", monospace`;
			return resolvedSystemMonospaceStack;
		}
	}

	resolvedSystemMonospaceStack = 'ui-monospace, monospace';
	return resolvedSystemMonospaceStack;
}

export function getFontFamilyStack (fontFamily) {
	const normalizedId = normalizeFontFamily(fontFamily);

	if (normalizedId === DEFAULT_FONT_FAMILY) {
		return resolveSystemMonospaceStack();
	}

	const match = FONT_FAMILY_OPTIONS.find((option) => option.id === normalizedId);

	return match?.family || resolveSystemMonospaceStack();
}

export function getFontFamilyOption (fontFamilyId) {
	const normalizedId = LEGACY_FONT_IDS[fontFamilyId] || fontFamilyId;

	return FONT_FAMILY_OPTIONS.find((option) => option.id === normalizedId) ||
		FONT_FAMILY_OPTIONS.find((option) => option.id === DEFAULT_FONT_FAMILY);
}

export function isFontAvailable (familyStack) {
	if (typeof document === 'undefined') {
		return false;
	}

	const primary = getPrimaryFamilyName(familyStack);

	if (primary === 'monospace' || primary === 'ui-monospace') {
		return true;
	}

	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

	context.font = `72px "${primary}", monospace`;

	return context.measureText(SAMPLE_TEXT).width !== getBaselineWidth();
}

export function describeFontSelection (fontFamilyId) {
	const option = getFontFamilyOption(fontFamilyId);

	if (!option) {
		return '';
	}

	if (option.description) {
		return option.description;
	}

	const primary = getPrimaryFamilyName(resolveSystemMonospaceStack());

	if (primary && primary !== 'monospace' && primary !== 'ui-monospace') {
		return `Uses ${primary} on this device.`;
	}

	return 'Uses the TV system monospace.';
}

export function getFontPreviewFamily (fontFamilyId) {
	return getFontFamilyStack(getFontFamilyOption(fontFamilyId).id);
}