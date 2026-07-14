import LS2Request from '@enact/webos/LS2Request';

const SERVICE_ID = 'com.github.gprot42.webosterminal.service';
const HB_SERVICE = 'luna://org.webosbrew.hbchannel.service';

function ls2Call ({service, method, parameters = {}, subscribe = false}) {
	return new Promise((resolve, reject) => {
		const req = new LS2Request();
		let settled = false;

		const finish = (fn, value) => {
			if (settled) {
				return;
			}

			settled = true;
			fn(value);
		};

		req.send({
			service,
			method,
			parameters,
			subscribe,
			onSuccess: (response) => {
				if (subscribe) {
					if (response?.type === 'exit' || response?.type === 'close') {
						finish(resolve, response);
					}
					return;
				}

				finish(resolve, response);
			},
			onFailure: (error) => {
				finish(reject, error || {errorText: 'LS2 request failed'});
			}
		});

		// Subscribe spawn may never fire exit on some builds — time out OK.
		if (subscribe) {
			setTimeout(() => finish(resolve, {timedOut: true}), 4000);
		} else {
			setTimeout(() => finish(reject, {errorText: 'LS2 request timed out'}), 15000);
		}
	});
}

/**
 * Ask Homebrew Channel to elevate our package service and restart any jailed
 * instance so the next activation runs as root outside the homebrew jail.
 *
 * @returns {Promise<{elevated: boolean, reason?: string, errorText?: string}>}
 */
export async function ensureTerminalServiceElevated () {
	// checkRoot responds returnValue:true only when HB itself is root.
	// Enact LS2Request treats returnValue:false as failure.
	let hbRoot = false;

	try {
		await ls2Call({
			service: HB_SERVICE,
			method: 'checkRoot',
			parameters: {}
		});
		hbRoot = true;
	} catch (err) {
		hbRoot = false;
	}

	try {
		await ls2Call({
			service: HB_SERVICE,
			method: 'elevateService',
			parameters: {id: SERVICE_ID}
		});
	} catch (err) {
		return {
			elevated: false,
			reason: hbRoot ? 'elevate-failed' : 'hb-not-root',
			errorText: err?.errorText || err?.message || String(err)
		};
	}

	// Kill jailed instance; ignore failures.
	try {
		await ls2Call({
			service: HB_SERVICE,
			method: 'spawn',
			parameters: {
				command:
					`/usr/sbin/ls-control scan-services >/dev/null 2>&1; ` +
					`pkill -f ${SERVICE_ID} >/dev/null 2>&1 || true`
			},
			subscribe: true
		});
	} catch (err) {
		// still elevated on disk
	}

	await new Promise((resolve) => setTimeout(resolve, 500));

	return {elevated: true, hbRoot};
}

export {SERVICE_ID};
