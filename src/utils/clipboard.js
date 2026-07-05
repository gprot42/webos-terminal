// webOS's browser is an older Chromium build; the async Clipboard API may be
// missing or blocked (no permission prompt in a TV app), so both helpers fall
// back to the classic hidden-textarea + execCommand technique.

export async function copyText (text) {
	if (!text) {
		return false;
	}

	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			// fall through to execCommand fallback
		}
	}

	if (typeof document === 'undefined') {
		return false;
	}

	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.select();

	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch (err) {
		ok = false;
	}

	document.body.removeChild(textarea);
	return ok;
}

export async function pasteText () {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
		try {
			return await navigator.clipboard.readText();
		} catch (err) {
			// fall through to execCommand fallback
		}
	}

	if (typeof document === 'undefined') {
		return '';
	}

	const textarea = document.createElement('textarea');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.focus();

	let text = '';
	try {
		if (document.execCommand('paste')) {
			text = textarea.value;
		}
	} catch (err) {
		text = '';
	}

	document.body.removeChild(textarea);
	return text;
}
