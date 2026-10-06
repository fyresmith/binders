// Fetches the Source Serif 4 files Binders carries for the pages (src/export/fonts/SourceSerif4-*.ttf.woff2 and the
// licence beside them) from Adobe's own release, github.com/adobe-fonts/source-serif, as it stood at one commit.
//   node scripts/source-serif-fonts.mjs           fetches the files, checks them and writes them
//   node scripts/source-serif-fonts.mjs --check   writes nothing: fails if a file here isn't the one Adobe released
//
// THESE FILES MUST STAY EXACTLY AS ADOBE RELEASED THEM, byte for byte. Source Serif is under the SIL Open Font
// License 1.1 "with Reserved Font Name 'Source'". Under that licence anything made from the files by "adding to,
// deleting, or substituting" any part of them, "by changing formats or by porting" is a Modified Version, and its
// condition 3 says no Modified Version may use a Reserved Font Name without the copyright holder's written
// permission, which Binders doesn't have. So: no subsetting (0.38.0 to 0.43.1 carried subsets, and that was the
// mistake), no converting from one format to another, no renaming inside the file, no hinting, no compressing again.
// The files are the WOFF2 files Adobe itself ships. An Original Version may keep its name and be bundled and given
// out with the licence, which is what Binders does. tests/export-fonts.test.ts fails if a file is not the one named
// here. To take a newer release: change TAG, COMMIT and the hashes (after reading that release's LICENSE.md), run
// this, and run the export tests, because other metrics move every line of every page.
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const TAG = '4.005R'; // "Fonts version 4.005 (OTF, TTF, WOFF, WOFF2, Variable)", 2023-01-20
export const COMMIT = '2823e993c53fca27c5c8749f529b56a5a7c77b6b'; // what that tag names: a tag can be moved, a commit can't
const RAW = `https://raw.githubusercontent.com/adobe-fonts/source-serif/${COMMIT}`;

// The static files with TrueType outlines, at the text optical size, as WOFF2: Chromium puts a static TrueType font
// into a PDF as text (a variable one is drawn, as Type 3). The style's bold is the family's Semibold.
// from: the path in Adobe's repository. to: the name here, when it isn't the same (only the licence's).
export const FILES = [
	{ from: 'WOFF2/TTF/SourceSerif4-Regular.ttf.woff2', sha256: '6b053e98f0838afe81f3e784727be4583a7c13bb42f198dc5202ecffee0aaee0' },
	{ from: 'WOFF2/TTF/SourceSerif4-It.ttf.woff2', sha256: 'ca3b17ed1e3e668ffd9e03385cfd46e1b095df783de53710d25d41241496026b' },
	{ from: 'WOFF2/TTF/SourceSerif4-Semibold.ttf.woff2', sha256: '457a13ac92e977d82e376038a2daac7fdb5433610910bf5787bdf6c1c3781865' },
	{ from: 'WOFF2/TTF/SourceSerif4-SemiboldIt.ttf.woff2', sha256: 'a49ea2a227bc8d6c56691203b1f456f80802368a9b7c3c577408859c408a4062' },
	{ from: 'LICENSE.md', to: 'OFL-SourceSerif4.md', sha256: '75784a295293a8992f5a8d99210566e0064a012e6dab6731305e3787f15896c7' },
];

/** A file's name in that folder. */
export const carriedAs = (file) => file.to ?? basename(file.from);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
	const check = process.argv.includes('--check');
	const FOLDER = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'export', 'fonts');
	let wrong = 0;
	for (const file of FILES) {
		const res = await fetch(`${RAW}/${file.from}`);
		if (!res.ok) { console.error(`${file.from}: ${res.status} from ${RAW}`); process.exit(1); }
		const bytes = Buffer.from(await res.arrayBuffer()), sum = sha256(bytes);
		if (sum !== file.sha256) { console.error(`${file.from}: not the file this script was written for (sha256 ${sum})`); process.exit(1); }
		const path = join(FOLDER, carriedAs(file));
		if (check) {
			let have = null;
			try { have = readFileSync(path); } catch { /* not there */ }
			if (!have || !have.equals(bytes)) { wrong++; console.error(`${carriedAs(file)} is not ${file.from} of ${TAG}`); }
		} else writeFileSync(path, bytes);
		console.log(`${carriedAs(file)}: ${bytes.length} bytes, ${file.from} of ${TAG}`);
	}
	if (wrong) process.exit(1);
}

// (the unit test reads the list above, bundled, where there is no import.meta; only running this file fetches)
if (import.meta.url && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
