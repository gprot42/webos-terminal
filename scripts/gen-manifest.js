#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const appinfoPath = path.join(repoRoot, 'webos-meta', 'appinfo.json');
const appinfo = JSON.parse(fs.readFileSync(appinfoPath, 'utf8'));
const ipkfile = path.join(repoRoot, 'dist', `${appinfo.id}_${appinfo.version}_all.ipk`);

if (!fs.existsSync(ipkfile)) {
	console.error(`Missing IPK: ${ipkfile}`);
	console.error('Run npm run build and ares-package in dist/ first.');
	process.exit(1);
}

const ipkhash = crypto.createHash('sha256').update(fs.readFileSync(ipkfile)).digest('hex');
const outfile = process.argv[2] || path.join(repoRoot, 'webos-meta', `${appinfo.id}.manifest.json`);

const manifest = {
	id: appinfo.id,
	version: appinfo.version,
	type: appinfo.type,
	title: appinfo.title,
	appDescription: appinfo.appDescription || appinfo.title,
	iconUri: `https://raw.githubusercontent.com/gprot42/webos-terminal/main/webos-meta/icon-large.png`,
	sourceUrl: 'https://github.com/gprot42/webos-terminal',
	rootRequired: true,
	ipkUrl: `${appinfo.id}_${appinfo.version}_all.ipk`,
	ipkHash: {
		sha256: ipkhash
	},
	ipkSize: fs.statSync(ipkfile).size
};

fs.writeFileSync(outfile, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`Wrote ${outfile}`);