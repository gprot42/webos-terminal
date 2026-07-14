#!/usr/bin/env node
//
// prune-dist.js
//
// Shrinks the packaged app after `enact pack` by removing bulk that is not
// needed for a single-language terminal app on webOS TV.
//
// Main win: iLib ships ~3.4k locale JSON files (~39 MB). Enact's ILibPlugin
// copies the full locale tree into dist/node_modules/ilib. We keep only
// root-level data plus English top-level files (no en/US country trees, no
// other languages). That drops the IPK from ~9 MB to well under 2 MB without
// changing runtime behaviour for en-US UI.
//
// Also drops redundant font formats (keep .woff for broad webOS coverage;
// drop .woff2 siblings when both exist) and build license sidecars.

const fs = require('fs');
const path = require('path');

const distRoot = path.resolve(__dirname, '../dist');
const ilibLocale = path.join(distRoot, 'node_modules', 'ilib', 'locale');

let removedFiles = 0;
let removedBytes = 0;

function rmFile (filePath) {
	try {
		const stat = fs.statSync(filePath);

		if (!stat.isFile()) {
			return;
		}

		removedBytes += stat.size;
		fs.unlinkSync(filePath);
		removedFiles += 1;
	} catch (err) {
		// ignore missing files
	}
}

function rmEmptyDirs (dir) {
	if (!fs.existsSync(dir)) {
		return;
	}

	const entries = fs.readdirSync(dir);

	for (const entry of entries) {
		const full = path.join(dir, entry);

		if (fs.statSync(full).isDirectory()) {
			rmEmptyDirs(full);
		}
	}

	if (fs.readdirSync(dir).length === 0 && dir !== ilibLocale) {
		fs.rmdirSync(dir);
	}
}

/**
 * Keep:
 *   - locale/*.json (root shared data)
 *   - locale/en/*.json (English top-level only — no en/US country trees)
 * Drop everything else (other languages, und/*, zoneinfo, nfkd, …).
 * `und` alone is multi‑MB of per-country stubs and is not needed for en UI.
 */
function shouldKeepLocaleFile (relPosix) {
	const parts = relPosix.split('/');

	if (parts[parts.length - 1] === 'ilibmanifest.json') {
		// Regenerated after prune.
		return false;
	}

	if (parts.length === 1) {
		return parts[0].endsWith('.json');
	}

	if (parts[0] === 'en' && parts.length === 2 && parts[1].endsWith('.json')) {
		return true;
	}

	return false;
}

function pruneIlibLocales () {
	if (!fs.existsSync(ilibLocale)) {
		console.log('prune-dist: no dist/node_modules/ilib/locale — skip locale prune');
		return;
	}

	const kept = [];

	function walk (dir, relBase) {
		for (const entry of fs.readdirSync(dir)) {
			const full = path.join(dir, entry);
			const rel = relBase ? `${relBase}/${entry}` : entry;
			const stat = fs.statSync(full);

			if (stat.isDirectory()) {
				walk(full, rel);
				continue;
			}

			const relPosix = rel.split(path.sep).join('/');

			if (shouldKeepLocaleFile(relPosix)) {
				if (relPosix.endsWith('.json') && entry !== 'ilibmanifest.json') {
					kept.push(relPosix);
				}
			} else {
				rmFile(full);
			}
		}
	}

	walk(ilibLocale, '');
	rmEmptyDirs(ilibLocale);

	// iLib loader reads this manifest; keep it accurate so it never 404s
	// on pruned paths.
	kept.sort();
	const manifestPath = path.join(ilibLocale, 'ilibmanifest.json');

	fs.writeFileSync(manifestPath, JSON.stringify({files: kept}, null, '\t') + '\n');
	console.log(`prune-dist: ilib locales kept ${kept.length} files`);
}

function pruneRedundantFonts () {
	const fontRoot = path.join(distRoot, 'node_modules', '@fontsource');

	if (!fs.existsSync(fontRoot)) {
		return;
	}

	function walk (dir) {
		for (const entry of fs.readdirSync(dir)) {
			const full = path.join(dir, entry);
			const stat = fs.statSync(full);

			if (stat.isDirectory()) {
				walk(full);
				continue;
			}

			// Prefer .woff2 (smaller; Chromium 36+ / webOS 4+). Drop the
			// .woff twin when both were emitted. Legacy WebKit (webOS 1–2)
			// would need .woff — that path is not in the supported package.
			if (entry.endsWith('.woff') && !entry.endsWith('.woff2')) {
				const woff2 = `${full}2`;

				if (fs.existsSync(woff2)) {
					rmFile(full);
				}
			}
		}
	}

	walk(fontRoot);
}

function pruneMisc () {
	const license = path.join(distRoot, 'main.js.LICENSE.txt');

	if (fs.existsSync(license)) {
		rmFile(license);
	}

	// Drop x86_64 ptybridge from TV-targeted packages? Keep it — needed for
	// webOS OSE / emulator and is only ~57 KB.
}

function formatBytes (n) {
	if (n < 1024) {
		return `${n} B`;
	}

	if (n < 1024 * 1024) {
		return `${(n / 1024).toFixed(1)} KB`;
	}

	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

if (!fs.existsSync(distRoot)) {
	console.error('prune-dist: dist/ not found — run enact pack first');
	process.exit(1);
}

pruneIlibLocales();
pruneRedundantFonts();
pruneMisc();

console.log(
	`prune-dist: removed ${removedFiles} files (${formatBytes(removedBytes)})`
);
