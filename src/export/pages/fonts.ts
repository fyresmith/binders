import garamondBold from '../fonts/eb-garamond-bold.woff2';
import garamondBoldItalic from '../fonts/eb-garamond-bold-italic.woff2';
import garamondItalic from '../fonts/eb-garamond-italic.woff2';
import garamond from '../fonts/eb-garamond-regular.woff2';
import sourceItalic from '../fonts/SourceSerif4-It.ttf.woff2';
import source from '../fonts/SourceSerif4-Regular.ttf.woff2';
import sourceBold from '../fonts/SourceSerif4-Semibold.ttf.woff2';
import sourceBoldItalic from '../fonts/SourceSerif4-SemiboldIt.ttf.woff2';

/* The typefaces Binders carries for the pages: EB Garamond (Classic) and Source Serif 4 (Modern), both under the SIL
   Open Font License (the notices are in src/export/fonts/). They are inside main.js as static files: a variable font
   would be embedded in the PDF as Type 3, drawn and not text. EB Garamond is cut down to what a book in the Latin
   alphabet needs (scripts/subset-fonts.py). Source Serif 4 is NOT cut down and must not be: its licence keeps the
   name "Source" for files that are as Adobe released them, so these are Adobe's own WOFF2 files, byte for byte
   (scripts/source-serif-fonts.mjs says which and why; tests/export-fonts.test.ts fails if one is changed). The
   style's bold is the family's Semibold. A style names its typeface by family; the faces are loaded into the pages'
   document before anything is measured, or the lines would be measured in another face. */

/** A family's four faces, each a WOFF2 file as base64: regular, italic, bold, bold italic. */
const FAMILIES: Record<string, readonly [string, string, string, string]> = {
	'EB Garamond': [garamond, garamondItalic, garamondBold, garamondBoldItalic],
	'Source Serif 4': [source, sourceItalic, sourceBold, sourceBoldItalic],
};
const FACES = [['400', 'normal'], ['400', 'italic'], ['700', 'normal'], ['700', 'italic']] as const;

/** The serifs a computer is likely to have for a script the carried faces don't hold, best first. A book in such a
    language is set in one of them throughout, so its page is of one face and not two. */
const SCRIPTS: [RegExp, string, string][] = [
	[/^(ru|uk|bg|sr|be|mk|kk|mn)\b/i, 'Cyrillic', '"Noto Serif", "PT Serif", "Times New Roman", "Liberation Serif", "DejaVu Serif"'],
	[/^el\b/i, 'Greek', '"Noto Serif", "GFS Didot", "Times New Roman", "Liberation Serif", "DejaVu Serif"'],
	[/^(he|yi)\b/i, 'Hebrew', '"Noto Serif Hebrew", "Frank Ruehl CLM", "David", "Times New Roman", "Liberation Serif"'],
	[/^(ar|fa|ur|ps|sd|ug)\b/i, 'Arabic', '"Noto Naskh Arabic", "Amiri", "Geeza Pro", "Traditional Arabic", "Times New Roman"'],
	[/^ja\b/i, 'Japanese', '"Noto Serif CJK JP", "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho"'],
	[/^zh\b/i, 'Chinese', '"Noto Serif CJK SC", "Noto Serif SC", "Songti SC", "SimSun"'],
	[/^ko\b/i, 'Korean', '"Noto Serif CJK KR", "Noto Serif KR", "AppleMyungjo", "Batang"'],
	[/^(hi|th|ka|hy)\b/i, 'this script', '"Noto Serif", "Times New Roman"'],
];
const script = (language: string) => SCRIPTS.find(([re]) => re.test(language));

/** True for a typeface that travels in the plugin. */
export const carried = (typeface: string): boolean => typeface in FAMILIES;

/** The `font-family` for a style's typeface in a book of some language. A letter the typeface doesn't have (a word
    of Greek in an English book) is set in the computer's own serif, as any page would have it. */
export function fontStack(typeface: string, language: string): string {
	const own = script(language), name = `"${typeface.replace(/["\\;{}]/g, '')}"`;
	return own ? `${own[2]}, serif` : `${name}, "Noto Serif", "Times New Roman", "Liberation Serif", serif`;
}

/** What to say when a book's language isn't written in what the style's typeface holds; "" when it is. */
export function fontWarning(typeface: string, language: string): string {
	const own = script(language);
	return own && carried(typeface) ? `${typeface} has no ${own[1] === 'this script' ? 'letters for this language' : `${own[1]} letters`}. The pages are set in this computer’s own serif instead.` : '';
}

const bytes = (base64: string): Uint8Array => { const raw = atob(base64), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };

/** A typeface's faces loaded into a document, ready before anything is measured. Nothing to do for one that isn't
    carried: it is the computer's, or it isn't there and the next in the stack is used. */
export async function loadFonts(doc: Document, typeface: string): Promise<void> {
	const files = FAMILIES[typeface], win = doc.defaultView;
	if (!files || !win) return;
	const Face = (win as unknown as { FontFace: typeof FontFace }).FontFace;
	await Promise.all(files.map(async (file, i) => {
		const face = new Face(typeface, bytes(file).buffer as ArrayBuffer, { weight: FACES[i][0], style: FACES[i][1] });
		doc.fonts.add(face);
		await face.load();
	}));
}

/** The same faces as `@font-face` rules, for the document that is printed (it is another process: it is handed text). */
export function fontFaceCss(typeface: string): string {
	const files = FAMILIES[typeface];
	if (!files) return '';
	return files.map((file, i) => `@font-face { font-family: "${typeface}"; font-weight: ${FACES[i][0]}; font-style: ${FACES[i][1]}; src: url(data:font/woff2;base64,${file}) format("woff2"); }`).join('\n') + '\n';
}
