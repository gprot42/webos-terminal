import Pause from '@enact/spotlight/Pause';
import {isShowing} from '@enact/webos/keyboard';

const spotlightPause = new Pause('webos-terminal-vkb');

export function isWebOSTV () {
	return typeof window !== 'undefined' && (
		typeof window.WebOSServiceBridge === 'function' ||
		typeof window.PalmServiceBridge === 'function' ||
		typeof window.PalmSystem !== 'undefined' ||
		typeof window.webOSSystem !== 'undefined'
	);
}

export function syncProxyInputDelta (input, previousLength = 0) {
	if (!input) {
		return {length: previousLength, delta: null};
	}

	const value = input.value || '';

	if (value.length < previousLength) {
		return {
			length: value.length,
			delta: '\x7f'.repeat(previousLength - value.length)
		};
	}

	if (value.length > previousLength) {
		return {
			length: value.length,
			delta: value.slice(previousLength)
		};
	}

	return {length: previousLength, delta: null};
}

export function mapKeyDownToTerminal (event) {
	const code = event.keyCode || event.which;

	if (code === 13) {
		return '\r';
	}

	if (code === 8) {
		return '\x7f';
	}

	return null;
}

export function focusInputElement (input, {fromUserGesture = false} = {}) {
	if (!input) {
		return;
	}

	try {
		input.focus({preventScroll: true});
	} catch (err) {
		input.focus();
	}

	// webOS only opens the VKB when a text field is activated by user interaction.
	if (fromUserGesture && isWebOSTV() && typeof input.click === 'function') {
		input.click();
	}
}

export function detachTerminalTextarea (term) {
	const textarea = term?.textarea;

	if (!textarea || !isWebOSTV()) {
		return;
	}

	textarea.tabIndex = -1;
	textarea.setAttribute('aria-hidden', 'true');
	textarea.style.pointerEvents = 'none';
	textarea.style.opacity = '0';
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
}

export function pauseSpotlightForKeyboard () {
	spotlightPause.pause();
}

export function resumeSpotlightForKeyboard () {
	spotlightPause.resume();
}

export function getInputLanguage () {
	if (typeof navigator !== 'undefined' && navigator.language) {
		return navigator.language;
	}

	return undefined;
}

const VKB_ARROW_KEY_CODES = new Set([37, 38, 39, 40]);

export function setKeyboardLayoutLock (locked) {
	if (typeof document === 'undefined') {
		return;
	}

	document.body.classList.toggle('vkb-layout-locked', locked);

	if (locked) {
		window.scrollTo(0, 0);
	}
}

export function isVkbArrowKey (event) {
	const code = event?.keyCode || event?.which;

	return VKB_ARROW_KEY_CODES.has(code);
}

export function shieldVkbArrowKey (event) {
	if (!isKeyboardVisible() || !isVkbArrowKey(event)) {
		return false;
	}

	// Spotlight calls preventDefault on arrows even when paused, which blocks
	// Magic Remote navigation on the system VKB (language/accent column keys).
	event.stopPropagation();
	return true;
}

export function bindKeyboardVisibility (onVisible, onHidden) {
	if (!isWebOSTV() || typeof document === 'undefined') {
		return () => {};
	}

	const handleKeyboardState = (ev) => {
		const visibility = ev?.detail?.visibility ?? ev?.visibility;

		if (visibility) {
			setKeyboardLayoutLock(true);
			onVisible?.();
		} else {
			setKeyboardLayoutLock(false);
			onHidden?.();
		}
	};

	document.addEventListener('keyboardStateChange', handleKeyboardState, false);

	return () => {
		document.removeEventListener('keyboardStateChange', handleKeyboardState, false);
		setKeyboardLayoutLock(false);
	};
}

export function isKeyboardVisible () {
	return Boolean(isShowing());
}