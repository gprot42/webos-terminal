/**
 * Minimal Luna bus client for webOS 1–2 (PalmServiceBridge).
 * ES5 only — do not use modern syntax.
 */
/* global PalmServiceBridge, WebOSServiceBridge */
var LegacyBridge = (function () {
	'use strict';

	/**
	 * Resolve the platform service-bridge constructor.
	 * Prefer window.* so we do not depend on bare globals; some WebKit builds
	 * only expose the bridge on window. Treat callable host objects as OK.
	 */
	function getBridgeCtor () {
		var w = typeof window !== 'undefined' ? window : null;
		var candidates = [];
		var i;
		var ctor;

		// Prefer modern name, then classic Palm name; window first then bare global.
		if (w) {
			candidates.push(w.WebOSServiceBridge, w.PalmServiceBridge);
		}

		try {
			if (typeof WebOSServiceBridge !== 'undefined') {
				candidates.push(WebOSServiceBridge);
			}
		} catch (err) {
			// ignore
		}

		try {
			if (typeof PalmServiceBridge !== 'undefined') {
				candidates.push(PalmServiceBridge);
			}
		} catch (err2) {
			// ignore
		}

		for (i = 0; i < candidates.length; i++) {
			ctor = candidates[i];

			if (typeof ctor === 'function') {
				return ctor;
			}

			// Extremely old host objects sometimes report typeof "object" but are
			// still constructible with `new`.
			if (ctor && typeof ctor === 'object') {
				try {
					// probe without leaving a live bridge if construction works
					var probe = new ctor();

					if (probe && typeof probe.call === 'function') {
						if (typeof probe.cancel === 'function') {
							try {
								probe.cancel();
							} catch (err3) {
								// ignore
							}
						}

						return ctor;
					}
				} catch (err4) {
					// not constructible
				}
			}
		}

		return null;
	}

	function hasBridge () {
		return getBridgeCtor() !== null;
	}

	function createBridge () {
		var Ctor = getBridgeCtor();

		if (!Ctor) {
			return null;
		}

		try {
			return new Ctor();
		} catch (err) {
			return null;
		}
	}

	/**
	 * @param {Object} opts
	 * @param {string} opts.uri - e.g. luna://.../open
	 * @param {Object} [opts.params]
	 * @param {boolean} [opts.subscribe]
	 * @param {Function} [opts.onSuccess]
	 * @param {Function} [opts.onFailure]
	 * @returns {{cancel: Function}|null}
	 */
	function request (opts) {
		var bridge = createBridge();
		var finished = false;
		var uri = opts.uri;
		var params = opts.params || {};
		var subscribe = !!opts.subscribe;
		var onSuccess = opts.onSuccess || function () {};
		var onFailure = opts.onFailure || function () {};

		if (!bridge) {
			onFailure({errorText: 'PalmServiceBridge unavailable', returnValue: false});
			return {cancel: function () {}};
		}

		if (subscribe) {
			params.subscribe = true;
		}

		bridge.onservicecallback = function (msg) {
			var data;

			try {
				data = typeof msg === 'string' ? JSON.parse(msg) : msg;
			} catch (err) {
				onFailure({errorText: 'Invalid service response', returnValue: false});
				return;
			}

			if (data && data.returnValue === false) {
				onFailure(data);
				return;
			}

			onSuccess(data || {});
		};

		try {
			bridge.call(uri, JSON.stringify(params));
		} catch (err) {
			onFailure({
				errorText: (err && err.message) || String(err),
				returnValue: false
			});
		}

		return {
			cancel: function () {
				if (finished) {
					return;
				}

				finished = true;

				try {
					if (typeof bridge.cancel === 'function') {
						bridge.cancel();
					}
				} catch (err) {
					// ignore
				}
			}
		};
	}

	return {
		hasBridge: hasBridge,
		request: request
	};
}());
