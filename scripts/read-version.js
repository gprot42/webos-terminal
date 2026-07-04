#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.resolve(__dirname, '..', 'version.md');

function readVersion (filePath = VERSION_FILE) {
	const content = fs.readFileSync(filePath, 'utf8');
	const line = content
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));

	if (!line || !/^\d+\.\d+\.\d+/.test(line)) {
		throw new Error(`Invalid version in ${filePath}: ${line ?? '(empty)'}`);
	}

	return line;
}

if (require.main === module) {
	console.log(readVersion());
}

module.exports = {readVersion, VERSION_FILE};