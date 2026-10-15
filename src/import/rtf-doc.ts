import type { DocxFile, DocxMark, DocxPara, DocxRun, Rev } from '../docx/read';
import { CHARSETS, decodePage, dest, parse, type Group } from './scriv/rtf';

/* A rich text file (.rtf) read as a word processor's document, the same shape a Word file is read into
   (`DocxFile`), so `settle` and the manuscript import treat both alike: tracked changes still in place, comments
   at the end of the words they are on, footnotes by number, pictures kept by reference until the plan asks.
   The tokenizer and the code pages are the Scrivener import's (`scriv/rtf.ts`); this is the reading of a whole
   document: paragraphs with their style's name (Word and LibreOffice write "heading 1" in the style sheet),
   outline level, alignment, indents, page breaks, lists and size. Word, LibreOffice and Scrivener write styles;
   TextEdit writes none, and its chapters are found by their lines (centered, bold, larger, "Chapter 12").
   What isn't read, counted so it can be said: headers and footers, hidden text, pictures other than PNG or JPEG.
   Pure. */

interface Char { b: boolean; i: boolean; s: boolean; u: boolean; v: boolean; fs: number; del: boolean; ins: boolean; page: number; uc: number; href?: string }
interface ParaProps { style: number; outline: number | null; align: string | null; first: number; left: number; right: number; pageBefore: boolean; inTable: boolean; list: { id: number; level: number } | null; label: string | null }
interface Style { name: string; outline: number | null; align: string | null; pageBefore: boolean; based: number | null; b: boolean; i: boolean }

const fresh = (): ParaProps => ({ style: 0, outline: null, align: null, first: 0, left: 0, right: 0, pageBefore: false, inTable: false, list: null, label: null });
const ALIGN: Record<string, string> = { qc: 'center', qr: 'right', qj: 'both', ql: 'left' };
/** Destinations that hold no text of the document: tables of fonts, colors and lists, what a program says of itself. */
const SKIP = new Set(['colortbl', 'listtable', 'listoverridetable', 'info', 'filetbl', 'revtbl', 'rsidtbl', 'xmlnstbl', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'generator', 'nonshppict', 'pgdsctbl', 'pn', 'bkmkstart', 'bkmkend', 'atrfstart', 'atrfend', 'atnid', 'atntime', 'atnicn', 'atnref', 'atndate', 'atnparent', 'objdata', 'objclass', 'mmathPr', 'expandedcolortbl', 'pgdsc', 'docvar', 'fchars', 'lchars', 'defchp', 'defpap', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'ftncn', 'aftncn', 'template', 'userprops', 'wgrffmtfilter', 'shpinst', 'xe', 'tc']);
const HEADERS = /^(header|footer)[lrf]?$/;

export function readRtfDocument(data: Uint8Array): DocxFile {
	let root: Group;
	try { root = parse(data, { lenient: true }); } catch (e) { throw new Error(`This rich text file can’t be read: ${e instanceof Error ? e.message : String(e)}.`); }
	const found: DocxFile['found'] = { inserted: 0, deleted: 0, comments: 0, underlined: 0, italic: 0, headers: false, textBoxes: 0, tables: 0, pictures: 0, endnotes: 0, hidden: 0 };
	const warnings = new Set<string>(), warn = (s: string) => warnings.add(s);
	const styles = new Map<number, Style>(), fontPages = new Map<number, number>();
	const notes = new Map<number, DocxPara[]>(), comments = new Map<string, { author: string; text: string }>();
	const pictures = new Map<string, { ext: string; bytes: Uint8Array }>();
	const REV: Record<'ins' | 'del', Rev> = { ins: { kind: 'ins', author: '', date: '', id: 'i' }, del: { kind: 'del', author: '', date: '', id: 'd' } };
	let ansi = 1252, defaultFont = 0, producer = '', fallback = 0, hiding = false, lastRev: Rev | undefined;
	let author = '', comment = 0, noteId = 0, toc = false, nextPage = false;

	// where paragraphs go (the book, a footnote, a comment), the one being read, and its paragraph formatting
	let target: DocxPara[] = [], cur: DocxPara | null = null, pp = fresh();
	const main = target;
	const open = (): DocxPara => (cur ??= { style: '', outline: null, align: null, pageBefore: false, indent: { first: 0, left: 0, right: 0 }, list: null, runs: [], toc: false, inTable: false, textBox: false, numbered: false });
	const styleOf = (n: number): { name: string; outline: number | null; align: string | null; pageBefore: boolean } => {
		const out = { name: '', outline: null as number | null, align: null as string | null, pageBefore: false }, seen = new Set<number>();
		for (let s = styles.get(n), depth = 0; s && depth < 24; depth++) {
			if (depth === 0) out.name = s.name;
			out.outline ??= s.outline; out.align ??= s.align; out.pageBefore ||= s.pageBefore;
			if (s.based === null || seen.has(s.based)) break;
			seen.add(s.based); s = styles.get(s.based);
		}
		return out;
	};
	/** The paragraph ends: its formatting is what is in force at its mark. `mark`: how its mark was revised. */
	const end = (c: Char | null) => {
		const p = open(); cur = null;
		const st = styleOf(pp.style), own = styles.get(pp.style);
		// Word and LibreOffice write a style's bold or italics on every run of its paragraphs as well: that is the
		// style's look (a heading's bold), as it is in a Word file, and isn't written into the text
		if (own?.b || own?.i) for (const r of p.runs) if (r.kind === 'text') { if (own.b) r.b = false; if (own.i) r.i = false; }
		p.style = st.name || (styles.size ? 'normal' : '');
		p.outline = pp.outline ?? st.outline;
		p.align = pp.align ?? st.align;
		p.pageBefore = pp.pageBefore || st.pageBefore || nextPage;
		nextPage = false;
		p.indent = { first: pp.first, left: pp.left, right: pp.right };
		p.inTable = pp.inTable;
		p.toc = toc || /^toc \d|^toc heading$|^contents/.test(p.style);
		if (pp.list || pp.label !== null) {
			// a list's label is written out before its text (`\listtext`): a bullet, or a number that counts
			const ordered = pp.label !== null && /[\dA-Za-z][.)]?\s*$/.test(pp.label.trim()) && !/^[•·\-–o§]$/.test(pp.label.trim());
			p.list = { id: pp.list?.id ?? 1, level: pp.list?.level ?? 0, ordered };
			p.numbered = true;
		}
		pp.label = null;
		if (p.inTable && !target[target.length - 1]?.inTable) found.tables++;
		if (c?.del || c?.ins) { p.markRev = c.del ? REV.del : REV.ins; if (c.del) found.deleted++; else found.inserted++; }
		target.push(p);
	};
	const push = (r: DocxRun | DocxMark) => { open().runs.push(r); };
	const text = (t: string, c: Char): void => {
		if (!t) return;
		// (a tab typed into the text as it is, not as \tab: some programs write one so)
		if (t.includes('\t')) { t.split('\t').forEach((part, k) => { if (k) push({ kind: 'tab' }); text(part, c); }); return; }
		if (c.v) { if (t.trim()) { open().hadHidden = true; if (!hiding) { found.hidden++; hiding = true; } } return; }
		if (t.trim()) hiding = false;
		const rev = c.del ? REV.del : c.ins ? REV.ins : undefined;
		if (rev && rev !== lastRev && t.trim()) { if (rev.kind === 'del') found.deleted++; else found.inserted++; }
		if (t.trim()) lastRev = rev;
		// (a link's underlining is how a link looks, not the writer's: it is neither counted nor made italic)
		if (c.href) c = { ...c, u: false };
		if (c.u && t.trim()) found.underlined++;
		if (c.i && t.trim()) found.italic++;
		const p = open(), last = p.runs[p.runs.length - 1];
		if (last && last.kind === 'text' && last.b === c.b && last.i === c.i && last.s === c.s && last.u === c.u && last.sz === c.fs && last.href === c.href && last.rev === rev) { last.text += t; return; }
		const r: DocxRun = { kind: 'text', text: t, b: c.b, i: c.i, s: c.s, u: c.u, sz: c.fs, ...(c.href ? { href: c.href } : {}) };
		if (rev) r.rev = rev;
		p.runs.push(r);
	};
	const plainText = (g: Group): string => g.tokens.map((t) => (typeof t === 'string' ? t : typeof t === 'object' && 'tokens' in t ? plainText(t) : '')).join('');
	/** A destination read into paragraphs of its own (a footnote, a comment), with the book's paragraph put back after. */
	const aside = (g: Group, c: Char, into: DocxPara[]) => {
		const was = { target, cur, pp: { ...pp }, nextPage, toc };
		target = into; cur = null; pp = fresh(); nextPage = false; toc = false;
		visit(g, { ...c }, true);
		if (cur) end(null);
		({ target, cur, nextPage, toc } = was); pp = was.pp;
	};

	/** `own`: the group's own words are read as text, not as the destination it names (a footnote's, read into its note). */
	const visit = (g: Group, outer: Char, own = false): void => {
		const kind = own ? '' : dest(g), c: Char = { ...outer };
		if (kind === 'fonttbl') {
			let font: number | undefined;
			const fonts = (group: Group) => { for (const t of group.tokens) {
				if (typeof t !== 'object') continue;
				if ('tokens' in t) fonts(t);
				else if ('word' in t) {
					if (t.word === 'f' && t.n !== undefined) { font = t.n; fontPages.set(font, ansi); }
					else if (t.word === 'fcharset' && font !== undefined && t.n !== undefined) fontPages.set(font, t.n === 0 || t.n === 1 ? ansi : CHARSETS[t.n] ?? -t.n);
					else if (t.word === 'cpg' && font !== undefined && t.n !== undefined) fontPages.set(font, t.n);
				}
			} };
			fonts(g);
			return;
		}
		if (kind === 'stylesheet') {
			for (const e of g.tokens) {
				if (typeof e !== 'object' || !('tokens' in e)) continue;
				// (a character or table style is `\*\cs` or `\ts`: not a paragraph's)
				const words = e.tokens.filter((t): t is { word: string; n?: number } => typeof t === 'object' && 'word' in t);
				if (words.some((w) => w.word === '*' || w.word === 'cs' || w.word === 'ts' || w.word === 'ds')) continue;
				const n = words.find((w) => w.word === 's')?.n ?? 0;
				const name = plainText({ tokens: e.tokens.filter((t) => typeof t === 'string') }).replace(/;\s*$/, '').trim().toLowerCase();
				const outline = words.find((w) => w.word === 'outlinelevel')?.n;
				const align = words.map((w) => ALIGN[w.word]).find(Boolean) ?? null;
				styles.set(n, { name, outline: outline !== undefined && outline >= 0 && outline <= 8 ? outline : null, align, pageBefore: words.some((w) => w.word === 'pagebb'), based: words.find((w) => w.word === 'sbasedon')?.n ?? null, b: words.some((w) => w.word === 'b' && w.n !== 0), i: words.some((w) => w.word === 'i' && w.n !== 0) });
			}
			return;
		}
		if (kind === 'generator') { producer ||= plainText(g).replace(/;\s*$/, '').trim(); return; }
		if (HEADERS.test(kind)) { found.headers = true; return; }
		if (kind === 'atnauthor') { author = plainText(g).trim(); return; }
		if (kind === 'annotation') {
			const into: DocxPara[] = [];
			aside(g, c, into);
			const id = String(++comment);
			comments.set(id, { author, text: into.map((p) => p.runs.map((r) => (r.kind === 'text' ? r.text : '')).join('')).join(' ').replace(/\s+/g, ' ').trim() });
			found.comments++;
			push({ kind: 'comment-end', id });
			author = '';
			return;
		}
		if (kind === 'footnote') {
			const endnote = g.tokens.some((t) => typeof t === 'object' && 'word' in t && t.word === 'ftnalt');
			const id = ++noteId, into: DocxPara[] = [];
			aside(g, { ...c, v: false }, into);
			notes.set(endnote ? -1 - id : id, into);
			if (endnote) found.endnotes++;
			push({ kind: 'note', id, end: endnote });
			return;
		}
		if (kind === 'listtext' || kind === 'pntext') { pp.label = plainText(g).replace(/\s+$/, ''); return; }
		if (kind === 'field') {
			const groups = g.tokens.filter((t): t is Group => typeof t === 'object' && 'tokens' in t);
			const inst = plainText(groups.find((t) => dest(t) === 'fldinst') ?? { tokens: [] }), result = groups.find((t) => dest(t) === 'fldrslt');
			const url = /HYPERLINK\s+(?:"([^"]*)"|(\S+))/i.exec(inst);
			const isToc = /^\s*TOC\b/i.test(inst), wasToc = toc;
			if (isToc) toc = true;
			if (result) visit(result, { ...c, ...(url ? { href: url[1] ?? url[2] } : {}) });
			toc = wasToc;
			return;
		}
		if (kind === 'pict') {
			found.pictures++;
			let ext = '', hex = ''; const binary: Uint8Array[] = [];
			for (const t of g.tokens) {
				if (typeof t === 'string') hex += t.replace(/\s/g, '');
				else if ('bytes' in t) binary.push(t.bytes);
				else if ('word' in t && (t.word === 'pngblip' || t.word === 'jpegblip')) ext = t.word === 'pngblip' ? 'png' : 'jpg';
			}
			if (!ext || (hex && (!/^[\da-f]+$/i.test(hex) || hex.length % 2))) { push({ kind: 'picture' }); return; }
			const chunks = [...binary, ...(hex ? [Uint8Array.from(hex.match(/../g) ?? [], (v) => parseInt(v, 16))] : [])], bytes = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
			let at = 0; for (const b of chunks) { bytes.set(b, at); at += b.length; }
			const rid = `pict${pictures.size + 1}`;
			pictures.set(rid, { ext, bytes });
			push({ kind: 'picture', rid });
			return;
		}
		if (kind === 'upr') {
			const alternatives = g.tokens.filter((t): t is Group => typeof t === 'object' && 'tokens' in t);
			const ud = alternatives.find((t) => dest(t) === 'ud') ?? alternatives[0];
			if (ud) visit({ tokens: ud.tokens.filter((t) => !(typeof t === 'object' && 'word' in t && (t.word === 'ud' || t.word === '*'))) }, c);
			return;
		}
		if (SKIP.has(kind)) return;
		// a part a reader that doesn't know it is told to pass over (`\*`), unless it is one known to hold text
		if (!own && g.tokens.some((t) => typeof t === 'object' && 'word' in t && t.word === '*') && !['shppict', 'shptxt', 'result'].includes(kind)) return;
		if (kind === 'shptxt') found.textBoxes++;

		for (let i = 0; i < g.tokens.length; i++) {
			const t = g.tokens[i];
			if (typeof t === 'string') {
				let s = decodePage(Uint8Array.from(t, (ch) => ch.charCodeAt(0)), c.page, warn);
				if (fallback) { const n = Math.min(fallback, s.length); s = s.slice(n); fallback -= n; }
				text(s, c); continue;
			}
			if ('tokens' in t) { visit(t, c); continue; }
			if ('bytes' in t) {
				const bytes = [...t.bytes];
				while (i + 1 < g.tokens.length && typeof g.tokens[i + 1] === 'object' && 'bytes' in (g.tokens[i + 1] as object)) bytes.push(...(g.tokens[++i] as { bytes: Uint8Array }).bytes);
				const skip = Math.min(fallback, bytes.length); fallback -= skip;
				text(decodePage(Uint8Array.from(bytes.slice(skip)), c.page, warn), c); continue;
			}
			const { word, n } = t;
			switch (word) {
				case 'b': c.b = n !== 0; break;
				case 'i': c.i = n !== 0; break;
				case 'strike': case 'striked': c.s = n !== 0; break;
				case 'ul': case 'uld': case 'uldb': case 'uldash': case 'ulw': case 'uldb1': case 'ulth': case 'ulwave': c.u = n !== 0; break;
				case 'ulnone': c.u = false; break;
				case 'v': c.v = n !== 0; break;
				case 'fs': c.fs = n && n > 0 ? n : 24; break;
				case 'deleted': c.del = n !== 0; break;
				case 'revised': c.ins = n !== 0; break;
				case 'plain': Object.assign(c, { b: false, i: false, s: false, u: false, v: false, fs: 24, page: fontPages.get(defaultFont) ?? ansi }); break;
				case 'uc': c.uc = n !== undefined && n >= 0 && n <= 16 ? n : 1; break;
				case 'u': if (n !== undefined) { text(String.fromCharCode(n & 0xffff), { ...c }); fallback = c.uc; } break;
				case 'ansicpg': if (n) ansi = c.page = n; break;
				case 'mac': ansi = c.page = 10000; break;
				case 'pc': ansi = c.page = 437; break;
				case 'pca': ansi = c.page = 850; break;
				case 'cpg': if (n) c.page = n; break;
				case 'deff': defaultFont = n ?? 0; break;
				case 'f': { const page = fontPages.get(n ?? 0); if (page !== undefined && page > 0) c.page = page; break; }
				case 'cocoartf': producer ||= 'TextEdit'; break;
				case 'pard': pp = { ...fresh(), label: pp.label }; break;
				case 's': pp.style = n ?? 0; break;
				case 'outlinelevel': pp.outline = n !== undefined && n >= 0 && n <= 8 ? n : null; break;
				case 'qc': case 'qr': case 'qj': case 'ql': pp.align = ALIGN[word]; break;
				case 'fi': pp.first = n ?? 0; break;
				case 'li': pp.left = n ?? 0; break;
				case 'ri': pp.right = n ?? 0; break;
				case 'pagebb': pp.pageBefore = n !== 0; break;
				case 'intbl': pp.inTable = true; break;
				case 'ls': pp.list = { id: n ?? 1, level: pp.list?.level ?? 0 }; break;
				case 'ilvl': pp.list = { id: pp.list?.id ?? 1, level: n ?? 0 }; break;
				case 'par': end(c); break;
				case 'cell': case 'nestcell': end(c); break;
				case 'sect': if (cur) end(c); nextPage = true; break;
				case 'sbknone': case 'sbkcol': if (!cur) nextPage = false; break;
				case 'page': push({ kind: 'br', page: true }); break;
				case 'line': push({ kind: 'br', page: false }); break;
				case 'tab': push({ kind: 'tab' }); break;
				case '~': text(' ', c); break;
				case '_': text('‑', c); break;
				case 'emdash': text('—', c); break;
				case 'endash': text('–', c); break;
				case 'emspace': case 'enspace': case 'qmspace': text(' ', c); break;
				case 'bullet': text('•', c); break;
				case 'lquote': text('‘', c); break;
				case 'rquote': text('’', c); break;
				case 'ldblquote': text('“', c); break;
				case 'rdblquote': text('”', c); break;
				default: break;
			}
		}
	};
	if (root.stray) warn(`This file has ${root.stray === 1 ? 'a closing brace' : `${root.stray} closing braces`} with no opening one, which some programs write. All its words are brought in, but a note or a style may have come loose from its place.`);
	visit(root, { b: false, i: false, s: false, u: false, v: false, fs: 24, del: false, ins: false, page: 1252, uc: 1 });
	if (cur) end(null);
	if (!producer) producer = styles.size ? 'Rich text' : '';
	return {
		producer, paras: main, notes, comments, found, said: [...warnings],
		picture: (rid) => { const p = pictures.get(rid); return p ? { ext: p.ext, load: () => p.bytes } : null; },
	};
}
