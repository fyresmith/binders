/* A small streaming XML reader for the parts of a .docx: events, not a tree, so a long book's document.xml is never
   held twice (the Scrivener import's `readXml` builds a whole tree and caps its size; a Word file is far larger).
   It reads tags with a sticky expression, one after another, and refuses what it doesn't understand: a DOCTYPE or an
   entity declaration (no external entities, ever), an entity it doesn't know, a tag that closes what isn't open, text
   left open at the end. Namespace prefixes are kept as written ("w:p"): Word, LibreOffice and Binders all write `w:`.
   Pure. */

export type XmlEvent =
	| { t: 'open'; name: string; attrs: Record<string, string>; empty: boolean }
	| { t: 'close'; name: string }
	| { t: 'text'; text: string };

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Text with its entities read. An entity other than the five and character references is refused. */
export function unescape(s: string): string {
	if (!s.includes('&')) return s;
	return s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));/g, (_m, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
		if (name !== undefined) { if (!Object.prototype.hasOwnProperty.call(NAMED, name)) throw new Error('This file holds an entity the reader doesn’t know, so it can’t be read safely.'); return NAMED[name]; }
		const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? '', 10);
		if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code < 0xe000)) throw new Error('This file holds a character that isn’t one.');
		return String.fromCodePoint(code);
	});
}

export function* events(xml: string): Generator<XmlEvent> {
	if (/<!DOCTYPE|<!ENTITY/i.test(xml.slice(0, 4096))) throw new Error('This file declares document types or entities, which import won’t read.');
	const open: string[] = [];
	TOKEN.lastIndex = 0;
	let at = 0;
	while (at < xml.length) {
		TOKEN.lastIndex = at;
		const m = TOKEN.exec(xml);
		if (!m) throw new Error('A part of this file isn’t well-formed XML, so it can’t be read.');
		at = TOKEN.lastIndex;
		if (m[6] !== undefined) { if (open.length) yield { t: 'text', text: unescape(m[6]) }; continue; }
		if (m[1] !== undefined) { if (m[1]) yield { t: 'text', text: m[1] }; continue; }
		if (m[3] === undefined) continue; // a comment or a processing instruction
		if (m[2]) {
			if (open.pop() !== m[3]) throw new Error('A part of this file isn’t well-formed XML, so it can’t be read.');
			yield { t: 'close', name: m[3] };
			continue;
		}
		const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
		ATTR.lastIndex = 0;
		for (let a = ATTR.exec(m[4]); a; a = ATTR.exec(m[4])) attrs[a[1]] = unescape(a[2] ?? a[3]);
		const empty = m[5] === '/';
		yield { t: 'open', name: m[3], attrs, empty };
		if (empty) yield { t: 'close', name: m[3] }; else open.push(m[3]);
	}
	if (open.length) throw new Error('A part of this file is cut short, so it can’t be read.');
}
