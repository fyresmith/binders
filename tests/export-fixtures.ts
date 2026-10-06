import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { crc32, deflateSync } from 'zlib';
// @ts-expect-error a plain module, without types
import { prose, rng } from '../scripts/demo-vault/build.mjs';
import type { SourceItem } from '../src/export/roles';
import type { Files } from './export-vault';

/* What the word-for-word tests of every writer read: a vault off the disk, a note with every row of "What Markdown
   becomes", and a binder of 150,000 words. */

const note = (name: string, text: string): SourceItem => ({ kind: 'note', name, path: `${name}.md`, text, included: true });
const folder = (name: string, children: SourceItem[]): SourceItem => ({ kind: 'folder', name, path: name, included: true, children });

/** A folder on the disk as a vault held in memory. */
export const read = (dir: string, files: Files = new Map(), at = ''): Files => {
	for (const name of readdirSync(join(dir, at))) {
		if (name.startsWith('.')) continue;
		const rel = at ? `${at}/${name}` : name, full = join(dir, rel);
		if (statSync(full).isDirectory()) read(dir, files, rel);
		else files.set(rel, /\.(md|txt|canvas|snapshot)$/.test(name) ? readFileSync(full, 'utf8') : new Uint8Array(readFileSync(full)));
	}
	return files;
};

/** A note with every row of the table in it, and the note it embeds. */
export const ROWS_TEXT = '---\nstatus: draft\n---\n# The crossing\n\n\tA tab starts this one, and *stress* with **weight** and ~~a cut~~ follow.\n\tA second, with `code words` and ==lit words== and a %%hidden remark%% gap.\n    Four spaces start this one. <!-- unseen --> It goes on.\n\nShe said "wait" -- then... nothing. It\'s the \'90s.\n---\nA link to [[Arrival]], to [[Part One/The keeper|the keeper]], to [[Arrival#The jetty]] and to [the site](https://example.com/page).\nAn address <https://example.org/plain> and a picture ![alt words here](missing.png) that is gone.\n\n![[Inner note]]\n\n![[paper.pdf]]\n\nA mark[^one] and another[^two], then one typed^[In place, with [a link](https://example.com) inside.] here.\n\n#draft #later\nA line with a #tag inside and an id at its end. ^abc-1\n\n> A quotation of two lines.\n> Its second line.\n\n> [!warning]+ Mind the step\n> The callout\'s own words.\n\n- first point\n- second point\n    - under the second\n\n3. third\n4. fourth\n\n| Left | Right |\n|:---|---:|\n| one [[N\\|shown]] | two |\n\n```js\nconst kept = `as typed`;\n```\n\n## A subheading here\n\nMath $a_1 + b_2$ stays, and a price of $5 too.\nA <span class="x">spanned</span> word and a line<br>broken.\n\n[^one]: The first note, with *stress*.\n[^two]: The second,\n    on two lines.\n[^three]: Never marked.';
export const ROWS_INNER = '---\nsynopsis: no\n---\nThe inner note\'s text.[^1]\n\n[^1]: And its own note.';

/** A binder of 150,000 words: three parts of ten chapters of five scenes, with footnotes, breaks and tabbed paragraphs. */
export function bigBinder(): SourceItem[] {
	const rand = rng('export-150k') as () => number, items: SourceItem[] = [];
	for (let p = 1; p <= 3; p++) {
		const chapters: SourceItem[] = [];
		for (let c = 1; c <= 10; c++) chapters.push(folder(`Chapter ${(p - 1) * 10 + c}`, Array.from({ length: 5 }, (_, s) => note(`Scene ${s + 1}`, `${prose(rand, 500) as string}[^a]\n\n***\n\n${(prose(rand, 500) as string).replace(/\. /g, '.\n\t')}\n\n[^a]: ${prose(rand, 12) as string}`, { path: `Part ${p}/Chapter ${(p - 1) * 10 + c}/Scene ${s + 1}.md` }))));
		items.push(folder(`Part ${p}`, chapters));
	}
	return items;
}

/** A real PNG of one grey, as a validator will have it: its header, its pixels, its end. */
export function grayPng(width: number, height: number): Uint8Array {
	const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body) >>> 0, body.length + 4); return out; };
	const head = Buffer.alloc(13);
	head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 0;
	const rows = Buffer.alloc((width + 1) * height, 0xcc);
	for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
	return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
