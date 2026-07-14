/**
 * Public surface for platform compatibility.
 *
 * Import from 'compat' (this folder) rather than reaching into legacy/ or
 * polyfills/ from feature code. That keeps webOS 2 / webOS 3 experiments
 * ringfenced under src/compat/legacy/.
 */

export {
	detectPlatform,
	isSupportedPlatform,
	isBootablePlatform,
	isLegacyPlatform,
	isWebOS2,
	isWebOS3,
	isWebOS3Platform,
	MIN_SUPPORTED_WEBOS_MAJOR,
	MIN_EXPERIMENTAL_WEBOS_MAJOR,
	LEGACY_WEBOS_MAJOR_MAX,
	WEBOS3_CHROME_MAJOR,
	WEBOS4_CHROME_MAJOR
} from './platform';
