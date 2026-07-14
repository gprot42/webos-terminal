/**
 * Platform detection for LG webOS TV.
 *
 * Ringfence rule: all webOS version / engine checks live here (or under
 * src/compat/). Feature code should call these helpers instead of parsing
 * userAgent / PalmSystem inline. That keeps webOS 1–3 paths isolated so they
 * cannot regress the first-class Chromium 53+ (webOS 4+) builds.
 *
 * Engine reference (LG developer docs):
 *   webOS 1.x  → WebKit 537.41
 *   webOS 2.x  → WebKit 538.2
 *   webOS 3.x  → Chromium 38
 *   webOS 4.x  → Chromium 53
 *   webOS 5.x  → Chromium 68
 *   webOS 6.x  → Chromium 79
 *   webOS 22+  → Chromium 87+ (year-named releases)
 */

const PLATFORM_CACHE_KEY = '__webosTerminalPlatform';

/**
 * Minimum webOS major for the first-class supported tier (Chromium 53+).
 * Matches the long-standing production target for known-good devices.
 */
export const MIN_SUPPORTED_WEBOS_MAJOR = 4;

/**
 * Minimum webOS major we actively try to boot (experimental).
 * webOS 3.x is Chromium 38 — syntax + polyfills target this floor.
 */
export const MIN_EXPERIMENTAL_WEBOS_MAJOR = 3;

/**
 * webOS majors at or below this are the pre-4.x legacy ringfence
 * (webOS 1–2 WebKit, webOS 3 Chromium 38). Code for those platforms must
 * live under src/compat/legacy/ only.
 */
export const LEGACY_WEBOS_MAJOR_MAX = 3;

/** Chrome major used on webOS 3.x. */
export const WEBOS3_CHROME_MAJOR = 38;

/** Chrome major used on webOS 4.x (first-class floor). */
export const WEBOS4_CHROME_MAJOR = 53;

function parseChromeMajor (ua) {
	const match = /Chrome\/(\d+)/i.exec(ua);

	return match ? parseInt(match[1], 10) : null;
}

function parseWebKitVersion (ua) {
	const match = /AppleWebKit\/([\d.]+)/i.exec(ua);

	return match ? match[1] : null;
}

/**
 * Infer webOS major from the embedded browser engine when sdkVersion is
 * unavailable (browser preview, incomplete firmware).
 */
function inferWebOSMajorFromEngine (chromeMajor, webkitVersion, ua) {
	const isWebOS = /Web0S|webOS|WebOS/i.test(ua) ||
		typeof window !== 'undefined' && !!(window.webOSSystem || window.PalmSystem);

	if (!isWebOS && chromeMajor == null) {
		return null;
	}

	// Pre-Chromium webOS apps use WebKit without a Chrome/ token.
	if (chromeMajor == null && webkitVersion) {
		const major = parseInt(webkitVersion, 10);

		if (major <= 537) {
			return 1;
		}

		if (major <= 538) {
			return 2;
		}

		// Unknown old WebKit — treat as webOS 2-class.
		return 2;
	}

	if (chromeMajor == null) {
		return null;
	}

	if (chromeMajor <= 38) {
		return 3;
	}

	if (chromeMajor <= 53) {
		return 4;
	}

	if (chromeMajor <= 68) {
		return 5;
	}

	if (chromeMajor <= 79) {
		return 6;
	}

	if (chromeMajor <= 87) {
		return 22;
	}

	if (chromeMajor <= 94) {
		return 23;
	}

	if (chromeMajor <= 108) {
		return 24;
	}

	if (chromeMajor <= 120) {
		return 25;
	}

	return 26;
}

function readSdkVersion () {
	if (typeof window === 'undefined') {
		return null;
	}

	const system = window.webOSSystem || window.PalmSystem;

	if (!system) {
		return null;
	}

	// deviceInfo is often a JSON string on older firmwares.
	const raw = system.deviceInfo || system.identifier || null;

	if (!raw || typeof raw !== 'string') {
		return system.version || null;
	}

	try {
		const info = JSON.parse(raw);

		return info.sdkVersion || info.version || null;
	} catch (err) {
		return system.version || null;
	}
}

function parseSdkMajor (sdkVersion) {
	if (!sdkVersion || typeof sdkVersion !== 'string') {
		return null;
	}

	// "6.5.3", "4.1.0", "25.1.0", etc.
	const match = /^(\d+)/.exec(sdkVersion.trim());

	return match ? parseInt(match[1], 10) : null;
}

/**
 * Detect the current runtime platform once and cache on window.
 *
 * @returns {{
 *   webOSMajor: number|null,
 *   sdkVersion: string|null,
 *   chromeMajor: number|null,
 *   webkitVersion: string|null,
 *   engine: 'chromium'|'webkit'|'unknown',
 *   isWebOS: boolean,
 *   isLegacy: boolean,
 *   isWebOS2: boolean,
 *   isWebOS3: boolean,
 *   isSupported: boolean,
 *   isExperimental: boolean,
 *   isBootable: boolean,
 *   tier: 'supported'|'webos3'|'legacy-webkit'|'unknown'
 * }}
 *
 * Note: tier `legacy-webkit` (webOS 1–2) is handled by the dual-boot loader in
 * dist/index.html, which loads src/legacy-webos2/ instead of the React app.
 * isBootable stays false for that tier on the modern path by design.
 */
export function detectPlatform () {
	if (typeof window !== 'undefined' && window[PLATFORM_CACHE_KEY]) {
		return window[PLATFORM_CACHE_KEY];
	}

	const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
	const chromeMajor = parseChromeMajor(ua);
	const webkitVersion = parseWebKitVersion(ua);
	const sdkVersion = readSdkVersion();
	const sdkMajor = parseSdkMajor(sdkVersion);
	const inferredMajor = inferWebOSMajorFromEngine(chromeMajor, webkitVersion, ua);
	const webOSMajor = sdkMajor != null ? sdkMajor : inferredMajor;

	const isWebOS = webOSMajor != null ||
		/Web0S|webOS|WebOS/i.test(ua) ||
		(typeof window !== 'undefined' && !!(window.webOSSystem || window.PalmSystem));

	let engine = 'unknown';

	if (chromeMajor != null) {
		engine = 'chromium';
	} else if (webkitVersion) {
		engine = 'webkit';
	}

	const onWebOS2 = webOSMajor === 2;
	// Prefer sdk major; fall back to Chrome 38-class engine only on webOS.
	const onWebOS3 = webOSMajor === 3 ||
		(isWebOS && chromeMajor != null &&
			chromeMajor >= WEBOS3_CHROME_MAJOR && chromeMajor < WEBOS4_CHROME_MAJOR);
	const isLegacy = webOSMajor != null && webOSMajor <= LEGACY_WEBOS_MAJOR_MAX;

	// First-class: webOS 4+ / Chrome 53+. Browser preview (no webOS) counts as supported.
	const isSupported = !isWebOS ||
		(webOSMajor != null && webOSMajor >= MIN_SUPPORTED_WEBOS_MAJOR) ||
		(chromeMajor != null && chromeMajor >= WEBOS4_CHROME_MAJOR);

	// Experimental: webOS 3 / Chrome 38-class — we try to boot the shared app.
	const isExperimental = !isSupported && Boolean(
		onWebOS3 ||
		webOSMajor === 3 ||
		(isWebOS && chromeMajor != null &&
			chromeMajor >= WEBOS3_CHROME_MAJOR && chromeMajor < WEBOS4_CHROME_MAJOR)
	);

	const isBootable = isSupported || isExperimental;

	let tier = 'unknown';

	if (isSupported) {
		tier = 'supported';
	} else if (isExperimental || onWebOS3) {
		tier = 'webos3';
	} else if (isLegacy || engine === 'webkit') {
		tier = 'legacy-webkit';
	}

	const platform = {
		webOSMajor,
		sdkVersion,
		chromeMajor,
		webkitVersion,
		engine,
		isWebOS,
		isLegacy,
		isWebOS2: onWebOS2,
		isWebOS3: Boolean(onWebOS3 || webOSMajor === 3),
		isSupported,
		isExperimental,
		isBootable,
		tier
	};

	if (typeof window !== 'undefined') {
		window[PLATFORM_CACHE_KEY] = platform;
	}

	return platform;
}

/** @returns {boolean} true for first-class tier (webOS 4+ / Chrome 53+). */
export function isSupportedPlatform () {
	return detectPlatform().isSupported;
}

/** @returns {boolean} true for webOS 3 experimental tier (Chromium 38). */
export function isWebOS3Platform () {
	const p = detectPlatform();

	return p.isWebOS3 || p.tier === 'webos3';
}

/** @returns {boolean} true when we attempt to run the shared app (4+ or 3). */
export function isBootablePlatform () {
	return detectPlatform().isBootable;
}

/** @returns {boolean} true for webOS 1–3 legacy ringfence. */
export function isLegacyPlatform () {
	return detectPlatform().isLegacy;
}

/**
 * True only on webOS 2.x (WebKit 538). Use to gate webOS2-only shims.
 * Prefer isLegacyPlatform() for broader pre-4.x checks.
 */
export function isWebOS2 () {
	return detectPlatform().webOSMajor === 2;
}

/** @returns {boolean} true only on webOS 3.x (or Chrome 38-class engine). */
export function isWebOS3 () {
	return isWebOS3Platform();
}
