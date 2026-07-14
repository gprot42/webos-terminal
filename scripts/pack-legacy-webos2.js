#!/usr/bin/env node
//
// pack-legacy-webos2.js
//
// Concatenates the vanilla ES5 legacy shell into dist/legacy-webos2.js and
// copies styles to dist/legacy-webos2.css. No Babel/React — source is already
// WebKit 538-safe ES5.
//
// Injects LEGACY_APP_VERSION from package.json.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'legacy-webos2');
const distDir = path.join(root, 'dist');

const SOURCES = [
	'bridge.js',
	'ansi-terminal.js',
	'shell-session.js',
	'app.js',
	'entry.js'
];

function readPackageVersion () {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

		return pkg.version || '0.0.0';
	} catch (err) {
		return '0.0.0';
	}
}

if (!fs.existsSync(distDir)) {
	fs.mkdirSync(distDir, {recursive: true});
}

const version = readPackageVersion();
const parts = [
	'/* webOS Terminal — legacy shell for webOS 1–2 (WebKit). Cut-down UI. */',
	'var LEGACY_APP_VERSION = ' + JSON.stringify(version) + ';'
];

for (const name of SOURCES) {
	const filePath = path.join(srcDir, name);

	if (!fs.existsSync(filePath)) {
		console.error('pack-legacy-webos2: missing ' + filePath);
		process.exit(1);
	}

	parts.push('\n/* ---- ' + name + ' ---- */\n');
	parts.push(fs.readFileSync(filePath, 'utf8'));
}

const outJs = path.join(distDir, 'legacy-webos2.js');
const outCss = path.join(distDir, 'legacy-webos2.css');
const cssSrc = path.join(srcDir, 'styles.css');

fs.writeFileSync(outJs, parts.join('\n') + '\n');
fs.writeFileSync(outCss, fs.readFileSync(cssSrc, 'utf8'));

const jsBytes = fs.statSync(outJs).size;
const cssBytes = fs.statSync(outCss).size;

console.log(
	'pack-legacy-webos2: wrote legacy-webos2.js (' + jsBytes +
	' bytes) + legacy-webos2.css (' + cssBytes + ' bytes), version ' + version
);
