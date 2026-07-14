/**
 * Entry point for the legacy webOS 1–2 shell.
 * Loaded only when the dual-boot loader detects WebKit / webOS ≤ 2.
 */
/* global LegacyApp */
(function () {
	'use strict';

	function boot () {
		try {
			LegacyApp.start();
		} catch (err) {
			var root = document.getElementById('root') || document.body;
			var msg = document.createElement('div');

			msg.style.cssText =
				'padding:48px;color:#ffb4ab;font:24px/1.4 monospace;background:#1a1a1a;min-height:100vh';
			msg.appendChild(document.createTextNode(
				'webOS Terminal (legacy) failed to start.\n\n' +
				((err && err.message) || String(err))
			));
			root.innerHTML = '';
			root.appendChild(msg);
		}
	}

	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		setTimeout(boot, 0);
	} else if (document.addEventListener) {
		document.addEventListener('DOMContentLoaded', boot, false);
	} else if (document.attachEvent) {
		document.attachEvent('onreadystatechange', function () {
			if (document.readyState === 'complete') {
				boot();
			}
		});
	} else {
		window.onload = boot;
	}
}());
