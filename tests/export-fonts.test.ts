import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { COMMIT, FILES, TAG, carriedAs, sha256 } from '../scripts/source-serif-fonts.mjs';
import { carried, fontFaceCss, fontStack, fontWarning } from '../src/export/pages/fonts';
import { done, eq, ok } from './harness';

// ---- Source Serif 4 is carried as Adobe released it, byte for byte ----
// Its licence (SIL OFL 1.1 "with Reserved Font Name 'Source'") lets an unmodified file keep its name and forbids the
// name to anything made from one: a subset, a conversion, a file compressed again. If this fails, don't change the
// hashes to match: put Adobe's files back (`node scripts/source-serif-fonts.mjs`). The hashes change only with a new
// release of Adobe's, taken whole.

const FONTS = join('src', 'export', 'fonts');
ok(/^[0-9a-f]{40}$/.test(COMMIT) && TAG.length > 0, 'the release is pinned by its commit');
eq(FILES.filter((f) => f.from.endsWith('.woff2')).length, 4, 'four faces: regular, italic, semibold, semibold italic');
for (const file of FILES) {
	const name = carriedAs(file);
	let sum = 'missing';
	try { sum = sha256(readFileSync(join(FONTS, name))); } catch { /* said below */ }
	eq(sum, file.sha256, `${name} is ${file.from} of Adobe's ${TAG}, unmodified`);
}

// no other Source Serif file beside them (a subset left behind, or made again), and the build takes these four
const adobes = new Set(FILES.map(carriedAs));
eq(readdirSync(FONTS).filter((f) => /source.?serif/i.test(f) && !adobes.has(f)).join(), '', 'no Source Serif file that isn’t one of Adobe’s');
const module = readFileSync(join('src', 'export', 'pages', 'fonts.ts'), 'utf8');
const imported = [...module.matchAll(/from '\.\.\/fonts\/([^']*)'/g)].map((m) => m[1]).filter((f) => /source.?serif/i.test(f)).sort();
eq(imported.join(), FILES.map(carriedAs).filter((f) => f.endsWith('.woff2')).sort().join(), 'the pages are set in exactly those four files');

// the licence travels with them: beside the files, and in the notices that head main.js
const licence = readFileSync(join(FONTS, 'OFL-SourceSerif4.md'), 'utf8'), notices = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');
const copyright = licence.split('\n')[0];
ok(copyright.includes('Reserved Font Name ‘Source’'), 'the licence reserves the name “Source”');
ok(notices.includes(copyright), 'the notices carry Adobe’s copyright line as it is');
ok(notices.includes('SIL OPEN FONT LICENSE Version 1.1') && notices.includes('PERMISSION & CONDITIONS'), 'and the licence’s text');
ok(notices.includes(TAG) && notices.includes(COMMIT), 'and say which release the files are');

// ---- which typeface a book of some language is set in, and what the window says ----

// the faces as the pages are handed them are those files, whole
const css = fontFaceCss('Source Serif 4');
eq((css.match(/@font-face/g) ?? []).length, 4, 'four faces of Source Serif 4 for the printed document');
for (const file of FILES.filter((f) => f.from.endsWith('.woff2'))) ok(css.includes(readFileSync(join(FONTS, carriedAs(file))).toString('base64')), `${carriedAs(file)} is handed to the pages whole`);
ok(carried('Source Serif 4') && carried('EB Garamond') && !carried('Georgia'), 'two families are carried');

const SERIF = 'The pages are set in this computer’s own serif instead.';
// Latin: the style's own typeface first, in both
for (const face of ['EB Garamond', 'Source Serif 4']) for (const language of ['en', 'en-GB', 'fr', 'vi', 'pl', '']) {
	ok(fontStack(face, language).startsWith(`"${face}", `), `${face} for ${language || 'no language'}`);
	eq(fontWarning(face, language), '', `nothing to say of ${face} for ${language || 'no language'}`);
}
// Cyrillic and Greek: Source Serif 4 has them, whole as it is carried; EB Garamond, cut down, doesn't
for (const language of ['ru', 'uk', 'bg', 'sr', 'be', 'mk', 'kk', 'mn', 'ru-RU', 'el', 'el-GR']) {
	ok(fontStack('Source Serif 4', language).startsWith('"Source Serif 4", '), `Source Serif 4 sets ${language} itself`);
	eq(fontWarning('Source Serif 4', language), '', `and the window has nothing to say of it (${language})`);
	ok(!fontStack('EB Garamond', language).includes('Garamond'), `EB Garamond doesn’t set ${language}`);
	eq(fontWarning('EB Garamond', language), `EB Garamond has no ${language.startsWith('el') ? 'Greek' : 'Cyrillic'} letters. ${SERIF}`, `and the window says so (${language})`);
}
// what neither holds
for (const [language, what] of [['he', 'Hebrew letters'], ['ar', 'Arabic letters'], ['ja', 'Japanese letters'], ['zh-Hant', 'Chinese letters'], ['ko', 'Korean letters'], ['hi', 'letters for this language']]) for (const face of ['EB Garamond', 'Source Serif 4']) {
	ok(!fontStack(face, language).includes(face) && fontStack(face, language).endsWith(', serif'), `${face} doesn’t set ${language}`);
	eq(fontWarning(face, language), `${face} has no ${what}. ${SERIF}`, `and the window says so (${face}, ${language})`);
}
eq(fontWarning('Georgia', 'ru'), '', 'a typeface that isn’t carried is the writer’s own business');

done('export fonts');
