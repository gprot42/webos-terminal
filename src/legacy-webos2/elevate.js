/**
 * Auto-elevate the terminal package service via Homebrew Channel.
 * ES5 only. Depends on LegacyBridge.
 *
 * Homebrew Channel (when itself rooted) exposes:
 *   luna://org.webosbrew.hbchannel.service/elevateService  {id: "<serviceName>"}
 * which rewrites Luna service definitions to run outside the prisoner jail
 * using HB's run-js-service wrapper (uid 0).
 */
/* global LegacyBridge */
var LegacyElevate = (function () {
	'use strict';

	var SERVICE_ID = 'com.github.gprot42.webosterminal.service';
	var HB_SERVICE = 'luna://org.webosbrew.hbchannel.service';
	var ELEVATE_URI = HB_SERVICE + '/elevateService';
	var SPAWN_URI = HB_SERVICE + '/spawn';
	var CHECK_ROOT_URI = HB_SERVICE + '/checkRoot';

	/**
	 * @param {Function} callback - function ({ok, elevated, reason, errorText})
	 */
	function ensure (callback) {
		var finished = false;
		var overallTimer;

		function finish (result) {
			if (finished) {
				return;
			}

			finished = true;

			if (overallTimer) {
				clearTimeout(overallTimer);
				overallTimer = null;
			}

			try {
				callback(result || {ok: false});
			} catch (err) {
				// ignore consumer errors
			}
		}

		overallTimer = setTimeout(function () {
			finish({ok: false, elevated: false, reason: 'elevate-timeout'});
		}, 20000);

		// checkRoot responds with returnValue: true only when HB is root.
		// Our bridge maps returnValue:false → onFailure, which is "not root".
		LegacyBridge.request({
			uri: CHECK_ROOT_URI,
			params: {},
			onSuccess: function () {
				// HB is root — patch our service definition + restart instance.
				_runElevate(finish);
			},
			onFailure: function (err) {
				// Not root, or checkRoot unavailable. Still try elevateService
				// (may work on some builds); if that fails, finish not-elevated.
				_runElevate(function (result) {
					if (result && result.elevated) {
						finish(result);
						return;
					}

					finish({
						ok: false,
						elevated: false,
						reason: 'hb-not-root',
						errorText: (err && err.errorText) ||
							'Homebrew Channel is not running as root'
					});
				});
			}
		});
	}

	function _runElevate (finish) {
		LegacyBridge.request({
			uri: ELEVATE_URI,
			params: {id: SERVICE_ID},
			onSuccess: function () {
				_restartServiceInstance(function (restartOk) {
					finish({
						ok: true,
						elevated: true,
						restarted: !!restartOk
					});
				});
			},
			onFailure: function (err) {
				finish({
					ok: false,
					elevated: false,
					reason: 'elevate-failed',
					errorText: (err && err.errorText) || 'elevateService failed'
				});
			}
		});
	}

	/**
	 * After patching Exec=/roles, kill any jailed instance so the next Luna
	 * activation starts the elevated run-js-service.
	 */
	function _restartServiceInstance (done) {
		var settled = false;
		var cmd =
			'/usr/sbin/ls-control scan-services >/dev/null 2>&1; ' +
			'pkill -f ' + SERVICE_ID + ' >/dev/null 2>&1 || true';

		function finishRestart (ok) {
			if (settled) {
				return;
			}

			settled = true;
			// Brief pause so the hub drops the old process before open().
			setTimeout(function () {
				done(ok);
			}, 500);
		}

		var safety = setTimeout(function () {
			finishRestart(true);
		}, 4000);

		LegacyBridge.request({
			uri: SPAWN_URI,
			params: {command: cmd},
			subscribe: true,
			onSuccess: function (response) {
				if (response && (response.type === 'exit' || response.type === 'close')) {
					clearTimeout(safety);
					finishRestart(true);
				}
			},
			onFailure: function () {
				clearTimeout(safety);
				// Elevation may still have patched files; open() can proceed.
				finishRestart(false);
			}
		});
	}

	return {
		SERVICE_ID: SERVICE_ID,
		ensure: ensure
	};
}());
