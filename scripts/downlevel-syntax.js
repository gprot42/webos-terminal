#!/usr/bin/env node
//
// downlevel-syntax.js
//
// Enact's build only runs Babel over @enact/* packages (see
// @enact/cli/config/webpack.config.js, which excludes node_modules except
// @enact scope). Third-party deps such as @xterm/xterm and web-vitals ship
// native ES2017+ syntax (optional chaining, nullish coalescing, logical
// assignment, arrow functions, template literals, classes, spread/rest,
// exponentiation, async/await, etc.) that predates Chrome 80/68. Older /
// entry-level webOS TVs (e.g. UP7550PTC on webOS 6.5.3, or webOS 4.x sets on
// Chromium 53) either fail to parse the bundle at all (black window) or get
// rejected by Homebrew Channel's ipk-verify compatibility check, which flags
// any ES2017+ syntax when webosRelease is >=4.
//
// This script downlevels that syntax to the project's browserslist target
// (chrome >= 53) in the built bundle after `enact pack`, so the app also
// runs on those older engines and passes ipk-verify's compatibility check.

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const target = path.resolve(__dirname, '../dist/main.js');

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
				targets: { chrome: '53' },
				modules: false,
				useBuiltIns: false
			}
		]
	]
});

const regeneratorRuntimePath = require.resolve('regenerator-runtime/runtime');
const regeneratorRuntimeSource = fs.readFileSync(regeneratorRuntimePath, 'utf8');

fs.writeFileSync(target, `${regeneratorRuntimeSource}\n${result.code}`);
console.log('downlevel-syntax: transformed ES2017+ syntax in dist/main.js');
