#!/usr/bin/env node
//
// downlevel-syntax.js
//
// Enact's build only runs Babel over @enact/* packages (see
// @enact/cli/config/webpack.config.js, which excludes node_modules except
// @enact scope). Third-party deps such as @xterm/xterm and web-vitals ship
// native ES2017+ syntax (optional chaining, nullish coalescing, logical
// assignment, arrow functions, template literals, classes, spread/rest,
// exponentiation, async/await, unicode property escapes, etc.) that older
// webOS TVs cannot parse.
//
// Targets:
//   - webOS 3.x  → Chromium 38  (experimental tier)
//   - webOS 4.x  → Chromium 53  (first-class floor historically)
//   - Homebrew Channel ipk-verify also flags ES2017+ for webosRelease >= 4
//
// We downlevel the entire bundle to Chrome 38 so the same IPK can attempt
// webOS 3 while remaining valid on webOS 4+ (older syntax runs fine on newer
// Chromium). Runtime APIs missing on Chrome 38 are handled by
// src/compat/legacy/webos3/polyfills.js — not here.

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const target = path.resolve(__dirname, '../dist/main.js');

// Keep in sync with package.json browserslist floor and WEBOS3_CHROME_MAJOR.
const CHROME_TARGET = '38';

if (!fs.existsSync(target)) {
	console.error(`downlevel-syntax: ${target} not found, skipping`);
	process.exit(0);
}

const result = babel.transformFileSync(target, {
	configFile: false,
	babelrc: false,
	compact: true,
	sourceType: 'unambiguous',
	presets: [
		[
			require.resolve('@babel/preset-env'),
			{
				targets: {chrome: CHROME_TARGET},
				modules: false,
				useBuiltIns: false,
				bugfixes: true
			}
		]
	]
});

const regeneratorRuntimePath = require.resolve('regenerator-runtime/runtime');
const regeneratorRuntimeSource = fs.readFileSync(regeneratorRuntimePath, 'utf8');

fs.writeFileSync(target, `${regeneratorRuntimeSource}\n${result.code}`);
console.log(
	`downlevel-syntax: transformed bundle to chrome ${CHROME_TARGET} in dist/main.js`
);
