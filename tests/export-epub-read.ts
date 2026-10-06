import { strFromU8, unzipSync } from 'fflate';
import { tokens, type Words } from './export-words';

/* An EPUB read back, for the word-for-word test: the way a reading app goes (the container names the package, the
   package's spine gives the order, each file is read in turn), with patterns of its own and no code of the writer's.
   What export itself wrote (the headings, the title page, a made copyright page, the contents, the scene-break
   marks, the footnotes' numbers) is no word of the writer's and is left out. */

const unxml = (s: string) => s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** The text of some XHTML: tags are nothing, except those that end a line or a cell, which are a space. */
const shown = (x: string) => unxml(x.replace(/<\/(p|h\d|li|td|th|pre|blockquote|figure|aside|section)>|<br\/>/g, ' ').replace(/<[^>]+>/g, ''));

export interface Epub extends Words {
	/** Every file, by its name in the zip: text for what is text. */
	files: Record<string, string>;
	raw: Record<string, Uint8Array>;
	/** The names of the files in the zip, in the order they are in it. */
	names: string[];
	/** The files of the reading order, as paths in the zip. */
	spine: string[];
	/** Each section's heading, as text. */
	headings: string[];
	/** The package file, and the navigation document. */
	opf: string;
	nav: string;
}

export function readEpub(bytes: Uint8Array): Epub {
	const raw = unzipSync(bytes), files: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw)) if (/\.(xhtml|opf|ncx|xml|css)$/.test(k) || k === 'mimetype') files[k] = strFromU8(v);
	const opfPath = /full-path="([^"]+)"/.exec(files['META-INF/container.xml'] ?? '')?.[1] ?? '', opf = files[opfPath] ?? '', base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const items = new Map([...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"[^>]*?(?: properties="([^"]+)")?\/>/g)].map((m) => [m[1], { href: base + m[2], nav: (m[3] ?? '').includes('nav') }] as const));
	const order = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => items.get(m[1])).filter((i): i is { href: string; nav: boolean } => !!i);
	const body: string[] = [], notes: string[] = [], headings: string[] = [];
	for (const item of order) {
		if (item.nav) continue;
		let x = /<body[^>]*>([\s\S]*)<\/body>/.exec(files[item.href] ?? '')?.[1] ?? '';
		// a page export made
		if (/<section [^>]*class="(titlepage|[^"]* made)"/.test(x)) continue;
		x = x.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/, (_m, h: string) => { headings.push(shown(h).replace(/\s+/g, ' ').trim()); return ''; });
		x = x.replace(/<p class="break"[^>]*>[\s\S]*?<\/p>/g, ' ').replace(/<a class="noteref"[^>]*>[^<]*<\/a>/g, '');
		x = x.replace(/<aside [^>]*>([\s\S]*?)<\/aside>/g, (_m, n: string) => { notes.push(...tokens(shown(n.replace(/<a [^>]*role="doc-backlink"[^>]*>[^<]*<\/a>/, '')))); return ''; });
		body.push(...tokens(shown(x)));
	}
	const nav = [...items.values()].find((i) => i.nav)?.href ?? '';
	return { files, raw, names: Object.keys(raw), spine: order.map((i) => i.href), headings, opf, nav: files[nav] ?? '', body, notes };
}
