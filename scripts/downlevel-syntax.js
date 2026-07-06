#!/usr/bin/env node
//
// downlevel-syntax.js
//
// Enact's build only runs Babel over @enact/* packages (see
// @enact/cli/config/webpack.config.js, which excludes node_modules except
// @enact scope). Third-party deps such as @xterm/xterm ship native
// optional-chaining (?.) and nullish-coalescing (?? / ??=) syntax, which
// predates Chrome 80. Older/entry-level webOS TVs (e.g. UP7550PTC on webOS
// 6.5.3) run a Chromium build that cannot parse that syntax at all, so the
// whole bundled dist/main.js fails to parse and the app window stays black.
// Homebrew Channel's ipk-verify also rejects ES2020 when webosRelease is >=4.
//
// This script downlevels that syntax in the built bundle after `enact pack`,
// so the app also runs on those older engines.

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
	plugins: [
		require.resolve('@babel/plugin-transform-optional-chaining'),
		require.resolve('@babel/plugin-transform-nullish-coalescing-operator'),
		require.resolve('@babel/plugin-transform-logical-assignment-operators')
	]
});

fs.writeFileSync(target, result.code);
console.log('downlevel-syntax: transformed ES2020 syntax in dist/main.js');
