/* The Scrivener 3 project's small parts: the choices about the format that are still open, each one constant; ids,
   dates and colors as Scrivener writes them. Pure. No specification of the format exists: what is here is from
   projects Scrivener itself wrote (Mac 3.1.4 to 3.5.2, Windows 3.1.5.1) and from the eight projects of the format
   spike, which the maintainer's Scrivener opened (docs/export.md, "The Scrivener project"). */

/** Who the project says made it. Honest by default: Binders and its version. `false` writes the string a real
    Scrivener wrote instead (Mac 3.1.4, older than any 3.x in use), which is what the spike's main project claimed. */
export const HONEST_CREATOR = true;
const SCRIVENER_CREATOR = 'SCRMAC-3.1.4-12105';
export const creator = (version: string): string => (HONEST_CREATOR ? `BINDERS-${version || '0'}` : SCRIVENER_CREATOR);

/** The full shape: `Files/styles.xml` and `Settings/compile.xml` beside what can't be left out, as a project
    Scrivener wrote has them. `false` writes the bare one (the `.scrivx`, `version.txt` and the documents). */
export const FULL_SHAPE = true;

/** A note or folder whose role isn't what the project's defaults by structure give it says its section type itself.
    `false` leaves every item to the defaults. */
export const ITEM_SECTION_TYPES = true;

/** Tags as the project's keywords. `false` leaves them out. */
export const KEYWORDS = true;

/** The format's number: 23 in every Scrivener 3 project read, with no line break after it. */
export const FORMAT = '23';

/** The custom metadata field that holds each item's path in the binder, for the import that comes after. */
export const PATH_FIELD = 'binderspath';

export const xml = (s: string): string => s.replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const attr = (s: string): string => xml(s).replace(/"/g, '&quot;').replace(/[\t\n\r]/g, ' ');

const mix = (h: number): number => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const SEEDS = [0x811c9dc5, 0x9e3779b9, 0x7f4a7c15, 0x165667b1], PRIMES = [0x01000193, 0xcc9e2d51, 0x1b873593, 0x27d4eb2f];

/** An id from a key, the same every time: a second export of the same binder gives every document the id it had.
    It looks like the random ids Scrivener makes (upper case, version 4). */
export function uuid(ns: string, key: string): string {
	const s = `${ns}\n${key}`, h = [...SEEDS];
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ (c + k), PRIMES[k]) + ((h[(k + 1) % 4] << 5) | (h[(k + 1) % 4] >>> 27)) | 0;
	}
	const x = [...h.map((v, k) => mix(v ^ Math.imul(s.length + k, PRIMES[k])).toString(16).padStart(8, '0')).join('').toUpperCase()];
	x[12] = '4';
	x[16] = '89AB'[parseInt(x[16], 16) & 3];
	const t = x.join('');
	return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20)}`;
}

/** A date as Scrivener writes it: local time with the offset, "2026-07-01 20:20:08 -0400". */
export function scrivDate(d: Date): string {
	const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0'), off = -d.getTimezoneOffset();
	return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off < 0 ? '-' : '+'}${p(Math.trunc(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
}

/** Obsidian's accent colors in its default light theme: what a label named for one is in the project, whatever theme
    the vault wears (a project has one color for a label, not one a theme). */
export const PALETTE_HEX: Record<string, string> = { red: '#e93147', orange: '#ec7500', yellow: '#e0ac00', green: '#08b94e', cyan: '#00bfbc', blue: '#086ddd', purple: '#7852ee', pink: '#d53984' };
/** A label that names no color. */
export const NEUTRAL_HEX = '#ababab';

/** A color as Scrivener writes one: three numbers from 0 to 1 ("0.913725 0.192157 0.278431", a whole one as "1.0"). */
export function floats(hex: string): string {
	return [1, 3, 5].map((i) => { const n = +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(6); return Number.isInteger(n) ? n.toFixed(1) : String(n); }).join(' ');
}
