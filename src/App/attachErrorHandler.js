import {onWindowReady} from '@enact/core/snapshot';
import {error} from '@enact/webos/pmloglib';

// Logs any uncaught exceptions to the system logs for future troubleshooting. Payload can be
// customized by the application for its particular requirements.
const showFatalError = (message, detail) => {
	const root = document.getElementById('root');

	if (!root || root.dataset.fatalErrorShown === 'true') {
		return;
	}

	root.dataset.fatalErrorShown = 'true';
	root.innerHTML = '';

	const panel = document.createElement('div');
	panel.style.cssText = [
		'box-sizing:border-box',
		'padding:48px',
		'color:#ffb4ab',
		'font:24px/1.4 sans-serif',
		'background:#1a1a1a',
		'min-height:100vh'
	].join(';');
	panel.textContent = message + (detail ? `\n\n${detail}` : '');
	root.appendChild(panel);
};

const isBenignError = (message) => {
	if (!message) {
		return false;
	}

	return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i.test(message);
};

const handleError = (ev) => {
	if (isBenignError(ev.message)) {
		return;
	}

	let stack = ev.error && ev.error.stack || null;

	if (stack && stack.length > 512) {
		// JSON must be limitted to 1024 characters so we truncate the stack to 512 for safety
		stack = ev.error.stack.substring(0, 512);
	}

	error('app.onerror', {
		message: ev.message,
		url: ev.filename,
		line: ev.lineno,
		column: ev.colno,
		stack
	}, '');

	showFatalError(
		'webOS Terminal failed to start.',
		[ev.message, ev.filename && `at ${ev.filename}:${ev.lineno}:${ev.colno}`, stack]
			.filter(Boolean)
			.join('\n')
	);
};

const handleRejection = (ev) => {
	const reason = ev.reason;
	const message = reason?.message || String(reason || 'Unhandled promise rejection');

	if (isBenignError(message)) {
		return;
	}

	const stack = reason?.stack;

	error('app.onunhandledrejection', {message, stack: stack?.substring(0, 512)}, '');
	showFatalError('webOS Terminal failed to start.', [message, stack].filter(Boolean).join('\n'));
};

onWindowReady(() => {
	window.addEventListener('error', handleError);
	window.addEventListener('unhandledrejection', handleRejection);
});

