// What every part of the demo vault's generator shares: the seeded random numbers, a note's and a snapshot's text as
// Obsidian and Binders write them, and the filler prose of the stress binders. Pure: nothing is read or written.
import { createHash } from 'node:crypto';

/** Change it and every generated text changes. */
export const SEED = 'binders-demo-1';

export const hash = (data) => createHash('sha256').update(data).digest('hex');

/** Random numbers from 0 to 1 that are the same for the same seed (mulberry32, seeded from the text's hash). */
export function rng(seed) {
	let a = parseInt(hash(String(seed)).slice(0, 8), 16);
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
export const pick = (rand, list) => list[Math.floor(rand() * list.length)];
export const p2 = (n) => String(n).padStart(2, '0');

const WORDS = ('salt road harbor lantern keeper tide ledger rope gull morning evening winter letter door stair window ' +
	'kitchen bread knife table river bridge market coin stranger sister brother mother captain boat sail weather storm ' +
	'quiet cold warm heavy narrow empty old young grey white dark bright slow sudden careful tired patient ' +
	'walked waited watched carried counted opened closed remembered forgot promised answered listened turned crossed ' +
	'the the the the a a and and but of of in in on to to with from over under before after until while ' +
	'she she he they it her his their nobody someone everything nothing again already almost never always').split(' ');

/** About `words` words of filler in paragraphs: enough like writing to count and scroll past. The stress binders use
    it (exactly as many words as asked for); the example books are written by prose.mjs. */
export function prose(rand, words) {
	const paras = [];
	for (let left = words; left > 0;) {
		const sentences = [];
		for (let s = int(rand, 2, 6); s > 0 && left > 0; s--) {
			const n = Math.min(left, int(rand, 5, 16)), w = [];
			for (let i = 0; i < n; i++) w.push(pick(rand, WORDS));
			left -= n;
			const text = w.join(' ');
			sentences.push(text[0].toUpperCase() + text.slice(1) + (rand() < 0.1 ? '?' : '.'));
		}
		paras.push(sentences.join(' '));
	}
	return paras.join('\n\n') + '\n';
}

/** Text as a YAML value: bare where YAML reads it back as the same text, quoted otherwise (a name like `1984`,
    `true` or `# hash`, anything with a colon, an emoji). */
export function yamlText(s) {
	return /^[A-Za-z][A-Za-z0-9 _.,'()/-]*$/.test(s) && !/\s$/.test(s) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(s) ? s : JSON.stringify(s);
}

/** A note: properties, then text. A list is written one entry to a line, as Obsidian writes it. */
export function note(props, body = '') {
	const lines = [];
	for (const [k, v] of Object.entries(props ?? {})) {
		if (v === undefined) continue;
		if (Array.isArray(v)) lines.push(v.length ? `${k}:` : `${k}: []`, ...v.map((x) => `  - ${typeof x === 'string' ? yamlText(x) : x}`));
		else lines.push(`${k}: ${typeof v === 'string' ? yamlText(v) : v}`);
	}
	return (lines.length ? `---\n${lines.join('\n')}\n---\n` : '') + body;
}

/** A snapshot's file, as src/snapshot-text.ts writes one. `at` is "2026-09-12 09.15.40". */
export function snapshot(of, at, body) {
	return `---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: ${at.replace(' ', 'T').replace(/\./g, ':')}\n---\n${body}`;
}

/** A canvas of cards in a row, each joined to the next. */
export const canvas = (cards) => JSON.stringify({ nodes: cards.map((c, i) => ({ id: `n${i}`, x: i * 320, y: 0, width: 280, height: 160, ...c })), edges: cards.slice(1).map((_, i) => ({ id: `e${i}`, fromNode: `n${i}`, fromSide: 'right', toNode: `n${i + 1}`, toSide: 'left' })) }, null, '\t') + '\n';
