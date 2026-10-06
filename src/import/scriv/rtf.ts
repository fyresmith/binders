/* Independent RTF reader. A group owns its formatting and code page; fields and pictures are destinations,
   not paragraphs. Unrepresentable formatting is reported and its original is kept by the import plan. */
interface Control { word: string; n?: number }
interface Group { tokens: Token[] }
type Token = string | Control | Group | { bytes: Uint8Array };
interface Run { text: string; bold?: boolean; italic?: boolean; strike?: boolean; url?: string; raw?: boolean }
interface State { bold: boolean; italic: boolean; strike: boolean; uc: number; page: number; ansi: number; defaultFont: number }
export interface RichText { markdown: string; plain: string; warnings: string[] }
export interface RtfOptions {
	link?(uuid: string, label: string): string | null;
	picture?(bytes: Uint8Array, extension: string): string;
}
/** Prose as Markdown that reads back as the same prose. Only what Obsidian would take for markup is escaped, where
    it would: a full stop, a dash or a bracket in a sentence is left as it was typed, so the note's text is the
    writer's, without a backslash after every sentence. What is escaped:
      anywhere: `\`, `*`, a backtick, `[` (a link, an embed, a footnote, a task), `$` (math), `_` unless it is
        inside a word, `<` before what could be a tag or a comment, `&` before what reads as an entity, `#` before
        a word (a tag), and `~~`, `==`, `%%` (struck, highlighted, a comment);
      at the start of a line: `#` and `>` (a heading, a quote), `-` or `+` and "1." or "1)" before a space (a list),
        and a line of nothing but dashes, equals signs, underscores or stars (a rule, or a heading under a line);
      at its end: `^name` (a block's id). */
export const escapeMarkdown = (text: string): string => text
	// (what comes before a character is asked of the text, not of the pattern: an iPhone before iOS 16.4 can't look behind)
	.replace(/[\\*`[$]|_|<(?=[A-Za-z/!?])|&(?=#?\w+;)|#(?=[^\s#])|[~=%]/gu, (c, at: number, all: string) => {
		const before = all[at - 1] ?? '', after = all[at + 1] ?? '';
		if (c === '_') return /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after) ? c : '\\_';
		return /[~=%]/.test(c) && before !== c && after !== c ? c : `\\${c}`;
	})
	.replace(/^([ \t]*)(#+(?=\s|$)|>|[-+](?=\s|$))/gm, '$1\\$2')
	.replace(/^([ \t]*\d+)([.)])(?=\s|$)/gm, '$1\\$2')
	.replace(/^([ \t]*)([-=_])(?=[-=_ \t]*$)/gm, '$1\\$2')
	.replace(/(\s)\^(?=[\w-]+[ \t]*$)/gm, '$1\\^');
const dest = (g: Group): string => (g.tokens.find((t) => typeof t === 'object' && 'word' in t && t.word !== '*') as Control)?.word ?? '';
/** Parts of a file that are not its text: tables of fonts and colors, what the program that wrote it says of
    itself, a page's header and footer, and the picture a newer one stands in for (`nonshppict`). */
const SKIP = new Set(['nonshppict', 'fonttbl', 'colortbl', 'stylesheet', 'info', 'listtable', 'listoverridetable', 'generator', 'header', 'headerl', 'headerr', 'footer', 'footerl', 'footerr', 'filetbl', 'revtbl', 'rsidtbl', 'xmlnstbl', 'themedata', 'colorschememapping', 'datafield', 'latentstyles']);

/** Why a file can't be read, as it is said after "Its text could not be read": in a writer's words, not rich text's. */
const CUT = 'the file is cut short', DAMAGED = 'the file is damaged';

/** A control word: its letters, a number if it has one, and the one space that ends it. */
const WORD = /([a-z]+)(-?\d+)? ?/iy;

function parse(data: Uint8Array): Group {
	if (data.length > 32 * 1024 * 1024) throw new Error('the file is larger than 32 MB');
	let s = '';
	for (let i = 0; i < data.length; i += 8192) s += String.fromCharCode(...data.subarray(i, i + 8192));
	if (!/^\{\\rtf1\b/.test(s)) throw new Error('the file isn’t rich text');
	let at = 0, count = 0;
	const group = (depth: number): Group => {
		if (depth > 100 || ++count > 500_000) throw new Error('the file is nested too deeply to read');
		at++;
		const tokens: Token[] = [];
		while (at < s.length) {
			const c = s[at++];
			if (c === '}') return { tokens };
			if (c === '{') { at--; tokens.push(group(depth + 1)); continue; }
			if (c === '\r' || c === '\n') continue;
			if (c !== '\\') {
				let text = c;
				while (at < s.length && !/[{}\\\r\n]/.test(s[at])) text += s[at++];
				tokens.push(text); continue;
			}
			const next = s[at++];
			if (!next) throw new Error(CUT);
			if (/[\\{}]/.test(next)) { tokens.push(next); continue; }
			if (next === '\n' || next === '\r') { if (next === '\r' && s[at] === '\n') at++; tokens.push({ word: 'par' }); continue; }
			if (next === "'") {
				const hex = s.slice(at, at + 2);
				if (!/^[\da-f]{2}$/i.test(hex)) throw new Error(DAMAGED);
				tokens.push({ bytes: Uint8Array.of(parseInt(hex, 16)) }); at += 2; continue;
			}
			if (!/[a-z]/i.test(next)) { tokens.push({ word: next }); continue; }
			at--;
			// (matched where it stands: a long text is not copied once for each of its control words)
			WORD.lastIndex = at;
			const m = WORD.exec(s);
			at += m[0].length;
			const word = m[1], n = m[2] === undefined ? undefined : Number(m[2]);
			if (word === 'bin') {
				if (!Number.isSafeInteger(n) || n < 0 || at + n > s.length) throw new Error(CUT);
				tokens.push({ bytes: data.slice(at, at + n) }); at += n;
			} else tokens.push({ word, n });
		}
		throw new Error(CUT);
	};
	const root = group(0);
	if (s.slice(at).trim()) throw new Error(DAMAGED);
	return root;
}

export function readRtf(data: Uint8Array, options: RtfOptions = {}): RichText {
	const root = parse(data), warnings = new Set<string>(), notes: string[] = [], fontPages = new Map<number, number>();
	const warn = (s: string) => warnings.add(s);
	const plain = (runs: Run[]) => runs.map((r) => r.text).join('');
	let fallback = 0;
	const decode = (bytes: Uint8Array, page: number): string => {
		const label = page === 65001 ? 'utf-8' : page === 932 ? 'shift_jis' : page === 936 ? 'gbk' : page === 949 ? 'euc-kr' : page === 950 ? 'big5' : page === 10000 ? 'macintosh' : `windows-${page}`;
		try { return new TextDecoder(label, { fatal: true }).decode(bytes); } catch {
			// A code page this can't read (DOS's, a font's own), or bytes that aren't in it: the words are plain letters
			// in every one of them, so they are kept, and the writer is told the accents may not be.
			if (bytes.some((b) => b > 127)) warn('Some characters were written in a way that can’t be read here, and may be wrong. The original file has them.');
			return new TextDecoder('windows-1252').decode(bytes);
		}
	};
	const visit = (g: Group, state: State, special = false): Run[] => {
		const kind = dest(g), out: Run[] = [], s = { ...state };
		if (kind === 'fonttbl') {
			const pages: Record<number, number> = { 0: s.ansi, 1: s.ansi, 77: 10000, 128: 932, 129: 949, 134: 936, 136: 950, 161: 1253, 162: 1254, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250 };
			let font: number | undefined;
			const fonts = (group: Group) => { for (const t of group.tokens) {
				if (typeof t !== 'object') continue;
				if ('tokens' in t) fonts(t);
				else if ('word' in t) {
					if (t.word === 'f') { font = t.n; fontPages.set(font, s.ansi); }
					else if (t.word === 'fcharset' && font !== undefined) {
						if (pages[t.n]) fontPages.set(font, pages[t.n]);
						else fontPages.set(font, -t.n);
					} else if (t.word === 'cpg' && font !== undefined) fontPages.set(font, t.n);
				}
			} };
			fonts(g);
			return out;
		}
		if (SKIP.has(kind)) { if (/^header|^footer/.test(kind)) warn('It has a page header or footer, which isn’t brought in. The original file has it.'); return out; }
		// (a comment as Word writes one: the writer's words, kept as a comment)
		if (kind === 'annotation' && !special) {
			const body = markdown(visit(g, s, true)).trim();
			return body ? [{ text: `%%${body.replace(/%%/g, '')}%%`, raw: true }] : out;
		}
		if (kind === 'upr') {
			const alternatives = g.tokens.filter((t): t is Group => typeof t === 'object' && 'tokens' in t);
			return alternatives.length ? visit(alternatives.find((t) => dest(t) === 'ud') ?? alternatives[0], s, true) : [];
		}
		// A part marked `\*` is one a reader that doesn't know it is told to pass over: what a program keeps for itself
		// (every file Scrivener writes on a Mac has some), not the document's text. The ones known to hold text are read.
		if (!special && g.tokens.some((t) => typeof t === 'object' && 'word' in t && t.word === '*') && !['fldinst', 'pn', 'listtext', 'pntext', 'shppict'].includes(kind)) return out;
		if (kind === 'pict') {
			let extension = '', hex = ''; const binary: Uint8Array[] = [];
			for (const t of g.tokens) {
				if (typeof t === 'string') hex += t.replace(/\s/g, '');
				else if ('bytes' in t) binary.push(t.bytes);
				else if ('word' in t && (t.word === 'pngblip' || t.word === 'jpegblip')) extension = t.word === 'pngblip' ? 'png' : 'jpg';
			}
			if (!extension || !options.picture) { warn('A picture of a kind that can’t be shown here (not PNG or JPEG) is left out. The original file has it.'); return out; }
			if (hex && (!/^[\da-f]+$/i.test(hex) || hex.length % 2)) throw new Error(DAMAGED);
			const chunks = [...binary, ...(hex ? [Uint8Array.from(hex.match(/../g), (v) => parseInt(v, 16))] : [])], bytes = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
			let offset = 0; for (const b of chunks) { bytes.set(b, offset); offset += b.length; }
			return [{ text: options.picture(bytes, extension), raw: true }];
		}
		if (kind === 'field') {
			const groups = g.tokens.filter((t): t is Group => typeof t === 'object' && 'tokens' in t), instruction = groups.find((t) => dest(t) === 'fldinst'), result = groups.find((t) => dest(t) === 'fldrslt');
			const inst = instruction ? plain(visit(instruction, s, true)) : '', label = result ? visit(result, s, true) : [];
			const url = /HYPERLINK\s+(?:"([^"]*)"|(\S+))/i.exec(inst);
			// (a field that isn't a link, a page number or a date, is what it shows)
			if (url) for (const r of label) r.url = url[1] ?? url[2];
			return label;
		}
		if (kind === 'footnote' && !special) {
			const body = visit(g, s, true); notes.push(markdown(body).trim());
			return [{ text: `[^${notes.length}]`, raw: true }];
		}
		const append = (text: string, unicode = false) => {
			if (!unicode && fallback) { const n = Math.min(fallback, text.length); text = text.slice(n); fallback -= n; }
			if (!text) return;
			const last = out[out.length - 1];
			if (last && !last.raw && !last.url && last.bold === s.bold && last.italic === s.italic && last.strike === s.strike) last.text += text;
			else out.push({ text, bold: s.bold, italic: s.italic, strike: s.strike });
		};
		for (let i = 0; i < g.tokens.length; i++) {
			const t = g.tokens[i];
			if (typeof t === 'string') { append(decode(Uint8Array.from(t, (c) => c.charCodeAt(0)), s.page)); continue; }
			if ('tokens' in t) { out.push(...visit(t, s)); continue; }
			if ('bytes' in t) {
				const bytes = [...t.bytes];
				while (i + 1 < g.tokens.length && typeof g.tokens[i + 1] === 'object' && 'bytes' in (g.tokens[i + 1] as object)) bytes.push(...(g.tokens[++i] as { bytes: Uint8Array }).bytes);
				const skip = Math.min(fallback, bytes.length); fallback -= skip;
				append(decode(Uint8Array.from(bytes.slice(skip)), s.page)); continue;
			}
			const { word, n } = t;
			if (word === 'b') s.bold = n !== 0;
			else if (word === 'i') s.italic = n !== 0;
			else if (word === 'strike') s.strike = n !== 0;
			else if (word === 'plain') { s.bold = s.italic = s.strike = false; s.page = fontPages.get(s.defaultFont) ?? s.ansi; }
			else if (word === 'uc') { if (n === undefined || n < 0 || n > 16) throw new Error(DAMAGED); s.uc = n; }
			else if (word === 'u') { if (n === undefined || n < -32768 || n > 65535) throw new Error(DAMAGED); append(String.fromCharCode(n & 0xffff), true); fallback = s.uc; }
			else if (word === 'ansicpg') s.ansi = s.page = n;
			else if (word === 'mac' || word === 'pc' || word === 'pca') s.ansi = s.page = word === 'mac' ? 10000 : word === 'pc' ? 437 : 850;
			else if (word === 'cpg') s.page = n;
			else if (word === 'deff') s.defaultFont = n;
			else if (word === 'f' && fontPages.has(n)) s.page = fontPages.get(n);
			else if (word === 'par' || word === 'row') append('\n\n');
			else if (word === 'line') append('\n');
			else if (word === 'tab' || word === 'cell') append('\t');
			else if (word === '~') append('\u00a0');
			else if (word === '_') append('\u2011');
			else if (word === 'emdash') append('—');
			else if (word === 'endash') append('–');
			else if (word === 'bullet') append('•');
			else if (word === 'lquote') append('‘');
			else if (word === 'rquote') append('’');
			else if (word === 'ldblquote') append('“');
			else if (word === 'rdblquote') append('”');
			else if (['intbl', 'trowd'].includes(word)) warn('A table is kept as its text, cell after cell. The original file has its layout.');
			// (a size, a color and a style's number are in every file, and say nothing of this one: only what a writer
			// puts on words by hand is said)
			else if ((['ul', 'highlight'].includes(word) && n !== 0) || word === 'super' || word === 'sub') warn('Underlining, highlighting, superscript and subscript aren’t carried over. The original file has them.');
		}
		return out;
	};
	const markdown = (runs: Run[]): string => {
		let text = '';
		for (const r of runs) {
			let said = r.raw ? r.text : r.text.split(/(\n+)/).map((part) => {
				if (/^\n+$/.test(part)) return part.length === 1 ? '  \n' : part;
				let said = escapeMarkdown(part);
				const lead = /^\s*/.exec(said)[0], tail = /\s*$/.exec(said)[0], middle = said.slice(lead.length, said.length - tail.length);
				if (middle) said = lead + (r.bold ? '**' : '') + (r.italic ? '*' : '') + (r.strike ? '~~' : '') + middle + (r.strike ? '~~' : '') + (r.italic ? '*' : '') + (r.bold ? '**' : '') + tail;
				return said;
			}).join('');
			if (r.url) {
				const uuid = /^scrivlnk:\/\/(?:[^/]+\/)?([\da-f-]+)\/?$/i.exec(r.url)?.[1];
				if (uuid) { const link = options.link?.(uuid, r.text); if (link) said = link; else warn('A link to a document that isn’t brought in is plain text here.'); }
				else if (/^(https?:|mailto:)/i.test(r.url)) said = `[${said}](${r.url.replace(/[\s()<>\\]/g, (c) => encodeURIComponent(c))})`;
				else warn('A link that isn’t to a web page or to a document is plain text here.');
			}
			text += said;
		}
		return text;
	};
	const runs = visit(root, { bold: false, italic: false, strike: false, uc: 1, page: 1252, ansi: 1252, defaultFont: 0 });
	// Half of a character that takes two (a file cut or edited by hand): marked where it stood, and said, the words
	// round it kept. Put right in the runs, so what is said of a place in the text holds for both readings of it.
	// (a pair can be split over two runs: only a half with no other half beside it in the whole text is one)
	const all = plain(runs), lone = new Set<number>(), high = (i: number) => all.charCodeAt(i) >= 0xd800 && all.charCodeAt(i) <= 0xdbff, low = (i: number) => all.charCodeAt(i) >= 0xdc00 && all.charCodeAt(i) <= 0xdfff;
	for (let i = all.search(/[\ud800-\udfff]/); i >= 0 && i < all.length; i++) if ((high(i) && !low(i + 1)) || (low(i) && !high(i - 1))) lone.add(i);
	if (lone.size) {
		warn('A character was damaged in the original file and is shown as “�”.');
		let at = 0;
		for (const r of runs) { r.text = [...Array(r.text.length).keys()].map((i) => lone.has(at + i) ? '�' : r.text[i]).join(''); at += r.text.length; }
	}
	// Scrivener's inline annotations and notes are literal marker text, not RTF destinations.
	let body = markdown(runs);
	const literal = plain(runs);
	if (literal.includes('\\Scrv_') || /<!?\$Scr_/.test(literal) || literal.includes('<$ScrKeepWithNext>')) {
		// Markers may cross formatting groups. Decode before escaping; keep their text rather than their syntax.
		const range = (start: number, end: number): string => {
			let at = 0; const selected: Run[] = [];
			for (const r of runs) { const from = Math.max(0, start - at), to = Math.min(r.text.length, end - at); if (to > from) selected.push({ ...r, text: r.text.slice(from, to) }); at += r.text.length; }
			return markdown(selected);
		};
		body = ''; let at = 0;
		for (const m of literal.matchAll(/\{\\Scrv_annot[\s\S]*?\\end_Scrv_annot\}|\{\\Scrv_fn=[\s\S]*?\\end_Scrv_fn\}|<!?\$Scr_(?:H|Ps|Cs)::[^>]+>|<\$ScrKeepWithNext>/g)) {
			body += range(at, m.index);
			if (m[0].startsWith('<')) {
				const heading = /^<\$Scr_H::([1-6])>$/.exec(m[0]);
				if (heading) body += `${body && !body.endsWith('\n\n') ? '\n\n' : ''}${'#'.repeat(Number(heading[1]))} `;
				else if (m[0].startsWith('<!$Scr_H')) body += '\n\n';
				else if (m[0] !== '<$ScrKeepWithNext>') warn('Text in a named style (not a heading) is plain text here. The original file has its style.');
				at = m.index + m[0].length; continue;
			}
			const annotation = m[0].startsWith('{\\Scrv_annot'), from = annotation ? m[0].indexOf('\\text=') + 6 : 10, to = m[0].indexOf(annotation ? '\\end_Scrv_annot' : '\\end_Scrv_fn');
			if (from < 6 || to < from) throw new Error(DAMAGED);
			const text = range(m.index + from, m.index + to);
			if (annotation) body += `%%${text}%%`; else { notes.push(text.trim()); body += `[^${notes.length}]`; }
			at = m.index + m[0].length;
		}
		body += range(at, literal.length);
	}
	// RTF list labels can be literal paragraph prefixes. Only turn verified labels into Markdown list markers.
	body = body.replace(/^(\s*)•\t/gm, '$1- ').replace(/^(\s*)(\d+)\\\.\t/gm, '$1$2. ');
	body = body.replace(/\n{3,}/g, '\n\n').trimEnd();
	if (notes.length) body += '\n\n' + notes.map((n, i) => `[^${i + 1}]: ${n.replace(/\n/g, '\n    ')}`).join('\n\n');
	return { markdown: body ? body + '\n' : '', plain: literal, warnings: [...warnings] };
}
