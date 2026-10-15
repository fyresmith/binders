import { unzipSync } from 'fflate';
import type { DocxFile, DocxMark, DocxPara, DocxRun, Rev } from '../docx/read';
import { MAX_PARAS } from '../docx/read';
import { MAX_PART } from '../docx/package';
import { events } from '../docx/xml';
import { MAX_BYTES, readZip, type ZipWording } from './source';

/* An OpenDocument text (.odt, a template .ott, or the flat .fodt) read as a word processor's document, in the shape
   a Word file is read into (`DocxFile`), so `settle` and the manuscript import treat both alike. Pure.
     - Headings are `text:h` with an outline level, or a paragraph whose style has one (LibreOffice gives "Heading 1"
       an outline level of 1 and its programmatic name, "Heading_20_1", in every language).
     - Formatting is in styles, never on the text: a span names an automatic style, which names its parent. Each is
       followed up its chain, the paragraph's style under the span's.
     - Spaces are XML's: a run of white space is one space, more are `text:s`, a paragraph's leading space is none.
     - `text:soft-page-break` is where the layout last broke a page, not a break the writer made: never read.
     - Tracked changes are a list at the top (`text:tracked-changes`): an insertion is marked in the text from its
       start to its end; a deletion is a point, with the deleted paragraphs kept in the list. Both are put back in
       the text here as Word has them (a run inserted or deleted, a paragraph's mark inserted or deleted), so
       Accept all and Reject all are `settle`'s.
     - Comments are `office:annotation`, with an end where they cover a range; notes are in the text.
   Namespace prefixes are taken as written: LibreOffice, Calligra, Google Docs and Word write the usual ones. */

export const MASTER = 'This is a master document (.odm), whose chapters are files of their own. In LibreOffice, choose File, Export, and save it as one .odt, then choose that.';
const WORDING: ZipWording = {
	tooBig: 'This OpenDocument file is larger than import can hold (256 MB unpacked).',
	split: 'This OpenDocument file is split over several files, or too large to read here.',
	twin: 'This OpenDocument file has two parts of the same name, which can’t be told apart.',
	link: 'This OpenDocument file holds a link to a file elsewhere, which import won’t follow.',
	damaged: (path) => `“${path}” is damaged in this OpenDocument file. Open it in LibreOffice and save it again, then choose that.`,
};
/** The most one picture may be, unpacked. */
const MAX_MEDIA = 32 * 1024 * 1024;

interface Style {
	auto: boolean; name: string; parent: string | null; outline: number | null; list: string | null; master: boolean;
	align: string | null; before: boolean; after: boolean; first: number | null; left: number | null; right: number | null;
	b: boolean | null; i: boolean | null; s: boolean | null; u: boolean | null; hidden: boolean | null; size: string | null;
}
type Text = { b: boolean; i: boolean; s: boolean; u: boolean; hidden: boolean; sz: number | null };

const TWIPS: Record<string, number> = { in: 1440, cm: 1440 / 2.54, mm: 144 / 2.54, pt: 20, pc: 240, px: 15 };
const twips = (v: string | undefined): number | null => { const m = /^(-?[\d.]+)(in|cm|mm|pt|pc|px)$/.exec(v ?? ''); return m ? Math.round(Number(m[1]) * TWIPS[m[2]]) : null; };
const ALIGN: Record<string, string> = { center: 'center', end: 'right', right: 'right', justify: 'both', start: 'left', left: 'left' };
/** A style's name as Word has its built-in ones, so the importer asks one question of both. */
function wordName(name: string): string {
	const n = name.replace(/_20_/g, ' ').replace(/_([\da-f]{2})_/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).toLowerCase().trim();
	if (n === 'text body' || n === 'body text' || n === 'standard' || n === 'default paragraph style' || n === 'first line indent') return 'normal';
	if (n === 'quotations') return 'quote';
	if (n === 'contents heading') return 'toc heading';
	const toc = /^contents (\d+)$/.exec(n);
	return toc ? `toc ${toc[1]}` : n;
}

export function readOdt(data: Uint8Array): DocxFile {
	let content: string, stylesXml = '', meta = '';
	let media: (path: string) => Uint8Array | null = () => null;
	const flat = data[0] === 0x3c || (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf);
	if (flat) {
		if (data.length > MAX_BYTES) throw new Error(WORDING.tooBig);
		try { content = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw new Error('This OpenDocument file isn’t the text it should be, and can’t be read.'); }
		if (!/<office:document[\s>]/.test(content.slice(0, 8192))) throw new Error('This isn’t an OpenDocument text file.');
		if (/office:mimetype="application\/vnd\.oasis\.opendocument\.text-master"/.test(content.slice(0, 8192))) throw new Error(MASTER);
	} else {
		if (data[0] === 0xd0 && data[1] === 0xcf) throw new Error('This file is locked with a password, or is an older kind of document. Open it in LibreOffice, save it as .odt with no password, then choose that.');
		if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('This isn’t an OpenDocument text file (.odt).');
		const parts = readZip(data, { words: WORDING, filter: (name) => /^(mimetype|content\.xml|styles\.xml|meta\.xml|META-INF\/manifest\.xml)$/.test(name) });
		const text = (name: string): string => { const b = parts.get(name); if (!b) return ''; try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { throw new Error(`A part of this OpenDocument file (${name}) isn’t the text it should be, and can’t be read.`); } };
		const mime = text('mimetype').trim();
		if (mime === 'application/vnd.oasis.opendocument.text-master' || mime === 'application/vnd.oasis.opendocument.text-master-template') throw new Error(MASTER);
		if (mime && !/^application\/vnd\.oasis\.opendocument\.text(-template)?$/.test(mime)) throw new Error('This OpenDocument file isn’t a text document (it may be a spreadsheet or a presentation).');
		if (/<manifest:encryption-data[\s/>]/.test(text('META-INF/manifest.xml'))) throw new Error('This OpenDocument file is locked with a password. Open it in LibreOffice, save it with no password, then choose that.');
		if ((parts.get('content.xml')?.length ?? 0) > MAX_PART) throw new Error('This OpenDocument file’s text is larger than import can hold (64 MB).');
		content = text('content.xml');
		if (!content) throw new Error('This zip file isn’t an OpenDocument text: it has no document in it.');
		stylesXml = text('styles.xml'); meta = text('meta.xml');
		media = (path) => { try { return unzipSync(data, { filter: (f) => f.name === path && f.originalSize <= MAX_MEDIA })[path] ?? null; } catch { return null; } };
	}

	const found: DocxFile['found'] = { inserted: 0, deleted: 0, comments: 0, underlined: 0, italic: 0, headers: false, textBoxes: 0, tables: 0, pictures: 0, endnotes: 0, hidden: 0 };
	const styles = new Map<string, Style>(), defaults = new Map<string, Style>(), lists = new Map<string, Map<number, boolean>>(), outlineNumbered = new Map<number, boolean>();
	const notes = new Map<number, DocxPara[]>(), comments = new Map<string, { author: string; text: string }>(), inline = new Map<string, Uint8Array>();
	let producer = /<meta:generator>([^<]*)</.exec(meta || content.slice(0, 65536))?.[1] ?? '';
	producer = producer.split('/')[0];

	// ---- styles (styles.xml, then the document's own automatic ones) ----
	const readStyles = (xml: string) => {
		let cur: Style | null = null, list: Map<number, boolean> | null = null, outline = false, auto = false, master = 0;
		for (const e of events(xml)) {
			if (e.t === 'text') { if (master && e.text.trim()) found.headers = true; continue; }
			if (e.t === 'close') {
				if (e.name === 'style:style' || e.name === 'style:default-style') cur = null;
				else if (e.name === 'text:list-style') list = null;
				else if (e.name === 'text:outline-style') outline = false;
				else if (e.name === 'office:automatic-styles') auto = false;
				else if (/^style:(header|footer)(-left|-first)?$/.test(e.name)) master--;
				continue;
			}
			const a = e.attrs;
			switch (e.name) {
				case 'office:automatic-styles': auto = true; break;
				case 'style:header': case 'style:footer': case 'style:header-left': case 'style:footer-left': case 'style:header-first': case 'style:footer-first': master++; break;
				case 'style:style': case 'style:default-style': {
					const family = a['style:family'] ?? '';
					if (family !== 'paragraph' && family !== 'text') break;
					const lvl = Number(a['style:default-outline-level']);
					cur = { auto, name: a['style:display-name'] ?? a['style:name'] ?? '', parent: a['style:parent-style-name'] ?? null, outline: lvl >= 1 && lvl <= 9 ? lvl - 1 : null, list: a['style:list-style-name'] ?? null, master: !!a['style:master-page-name'], align: null, before: false, after: false, first: null, left: null, right: null, b: null, i: null, s: null, u: null, hidden: null, size: null };
					if (e.name === 'style:default-style') defaults.set(family, cur);
					else styles.set(`${family}:${a['style:name'] ?? ''}`, cur);
					break;
				}
				case 'style:paragraph-properties': if (cur) {
					if (a['fo:text-align']) cur.align = ALIGN[a['fo:text-align']] ?? null;
					if (a['fo:break-before'] === 'page') cur.before = true;
					if (a['fo:break-after'] === 'page') cur.after = true;
					cur.first = twips(a['fo:text-indent']) ?? cur.first; cur.left = twips(a['fo:margin-left'] ?? a['fo:margin-start']) ?? cur.left; cur.right = twips(a['fo:margin-right'] ?? a['fo:margin-end']) ?? cur.right;
				} break;
				case 'style:text-properties': if (cur) {
					if (a['fo:font-weight']) cur.b = a['fo:font-weight'] === 'bold' || Number(a['fo:font-weight']) >= 600;
					if (a['fo:font-style']) cur.i = a['fo:font-style'] === 'italic' || a['fo:font-style'] === 'oblique';
					if (a['style:text-line-through-style']) cur.s = a['style:text-line-through-style'] !== 'none';
					if (a['style:text-underline-style']) cur.u = a['style:text-underline-style'] !== 'none';
					if (a['text:display']) cur.hidden = a['text:display'] === 'none';
					if (a['fo:font-size']) cur.size = a['fo:font-size'];
				} break;
				case 'text:list-style': list = new Map(); lists.set(a['style:name'] ?? '', list); break;
				case 'text:list-level-style-number': case 'text:list-level-style-bullet': case 'text:list-level-style-image':
					if (list) list.set(Number(a['text:level'] ?? 1) - 1, e.name === 'text:list-level-style-number' && !!a['style:num-format']); break;
				case 'text:outline-style': outline = true; break;
				case 'text:outline-level-style': if (outline) outlineNumbered.set(Number(a['text:level'] ?? 1) - 1, !!a['style:num-format']); break;
				default: break;
			}
		}
	};
	if (stylesXml) readStyles(stylesXml);
	// (the document's automatic styles are read as the body is: they come first in content.xml)

	const chain = (family: string, name: string | null): Style[] => {
		const out: Style[] = [], seen = new Set<string>();
		// (a chain that loops back on itself ends where it would repeat)
		for (let at = name, s = at ? styles.get(`${family}:${at}`) : undefined; s && at !== null && !seen.has(at) && out.length < 24; at = s.parent, s = at ? styles.get(`${family}:${at}`) : undefined) { seen.add(at); out.push(s); }
		const d = defaults.get(family);
		if (d) out.push(d);
		return out;
	};
	const first = <K extends keyof Style>(list: Style[], key: K): Style[K] | null => { for (const s of list) if (s[key] !== null && s[key] !== false) return s[key]; return null; };
	/** A size as half-points, a percentage taken of what is under it. */
	const sizeOf = (list: Style[]): number | null => {
		let scale = 1;
		for (const s of list) {
			if (!s.size) continue;
			const pct = /^([\d.]+)%$/.exec(s.size);
			if (pct) { scale *= Number(pct[1]) / 100; continue; }
			const pt = twips(s.size);
			if (pt !== null) return Math.round((pt / 10) * scale);
		}
		return null;
	};
	const textOf = (spans: string[], para: string | null): Text => {
		const own = spans.slice().reverse().flatMap((s) => chain('text', s).filter((x) => x !== defaults.get('text'))), para_ = chain('paragraph', para);
		// Bold and italics are the writer's when they are on the words, or on a paragraph by hand (an automatic style):
		// a heading style's bold is the style's look, as Word's is, and isn't written into the text.
		const marks = [...own, ...para_.filter((x) => x.auto)], all = [...own, ...para_];
		return { b: !!first(marks, 'b'), i: !!first(marks, 'i'), s: !!first(marks, 's'), u: !!first(marks, 'u'), hidden: !!first(all, 'hidden'), sz: sizeOf(all) };
	};

	// ---- the body ----
	const REV_INS: Rev = { kind: 'ins', author: '', date: '', id: 'i' }, REV_DEL: Rev = { kind: 'del', author: '', date: '', id: 'd' };
	interface Open { p: DocxPara; style: string | null; into: DocxPara[]; spaced: boolean; hidden: boolean; after: DocxPara[] }
	const main: DocxPara[] = [], deletions = new Map<string, DocxPara[]>(), regionKind = new Map<string, string>();
	const stack: Open[] = [], spans: string[] = [], hrefs: (string | undefined)[] = [];
	let into: DocxPara[] = main, skip = 0, tbl = 0, toc = 0, listDepth = 0, listStyle: string[] = [], nextPage = false;
	let noteId = 0, inNote: { id: number; end: boolean; was: DocxPara[] } | null = null, citation = false, insertions = 0, binary: string | null = null;
	let annotation: { name: string; author: string; paras: DocxPara[]; creator: boolean; was: DocxPara[] } | null = null;
	let region: string | null = null, deleting: DocxPara[] | null = null;
	// (frames can hold frames: a picture in a text box in a frame)
	const frames: { image: string | null; object: boolean; bin: string }[] = [];
	const frameOf = () => frames[frames.length - 1];
	const named = new Map<string, string>();
	const blank = (style: string | null, heading: number | null): Open => {
		const st = chain('paragraph', style), named_ = st.find((s) => !s.auto);
		const p: DocxPara = {
			style: wordName(named_?.name ?? ''), outline: heading ?? first(st, 'outline'), align: first(st, 'align'), pageBefore: !!first(st, 'before') || nextPage || st.some((s) => s.auto && s.master && main.length > 0),
			indent: { first: first(st, 'first') ?? 0, left: first(st, 'left') ?? 0, right: first(st, 'right') ?? 0 }, list: null, runs: [], toc: toc > 0, inTable: tbl > 0, textBox: false, numbered: false,
		};
		nextPage = false;
		if (first(st, 'after')) nextPage = true;
		if (/^toc \d|^toc heading$/.test(p.style)) p.toc = true;
		return { p, style, into, spaced: true, hidden: false, after: [] };
	};
	const top = (): Open | undefined => stack[stack.length - 1];
	const rev = (): Rev | undefined => (deleting ? REV_DEL : insertions > 0 ? REV_INS : undefined);
	const push = (r: DocxRun | DocxMark) => { const t = top(); if (!t) return; const v = rev(); if (v && r.kind !== 'comment-start' && r.kind !== 'comment-end') (r as DocxRun).rev = v; t.p.runs.push(r); t.spaced = false; };
	let hiding = false;
	const add = (raw: string, collapse: boolean) => {
		const t = top();
		if (!t || citation) return;
		let text = collapse ? raw.replace(/[ \t\r\n]+/g, ' ') : raw;
		if (collapse && t.spaced) text = text.replace(/^ /, '');
		if (!text) return;
		const fmt = textOf(spans, t.style);
		if (fmt.hidden) { if (text.trim()) { t.p.hadHidden = true; if (!hiding) { found.hidden++; hiding = true; } } return; }
		if (text.trim()) hiding = false;
		if (fmt.u && text.trim()) found.underlined++;
		if (fmt.i && text.trim()) found.italic++;
		const href = hrefs[hrefs.length - 1], v = rev(), last = t.p.runs[t.p.runs.length - 1];
		t.spaced = collapse && text.endsWith(' ');
		if (last && last.kind === 'text' && last.b === fmt.b && last.i === fmt.i && last.s === fmt.s && last.u === fmt.u && last.sz === fmt.sz && last.href === href && last.rev === v) { last.text += text; return; }
		const r: DocxRun = { kind: 'text', text, b: fmt.b, i: fmt.i, s: fmt.s, u: fmt.u, sz: fmt.sz, ...(href ? { href } : {}) };
		if (v) r.rev = v;
		t.p.runs.push(r);
	};
	/** A deletion put back where it was: its first paragraph's words here, and each further paragraph a paragraph
	    of its own after this one's mark, which the deletion took too. */
	const putBack = (id: string) => {
		const del = deletions.get(id), t = top();
		if (!del?.length || !t) return;
		found.deleted++;
		const mark = (p: DocxPara) => { for (const r of p.runs) if (r.kind !== 'comment-start' && r.kind !== 'comment-end') (r as DocxRun).rev = REV_DEL; return p.runs; };
		t.p.runs.push(...mark(del[0]));
		for (const d of del.slice(1)) {
			t.p.markRev = REV_DEL;
			t.into.push(t.p);
			t.p = { ...d, runs: mark(d), markRev: undefined };
		}
	};

	for (const e of events(content)) {
		if (e.t === 'text') {
			if (skip) continue;
			if (binary !== null) { binary += e.text; continue; }
			if (annotation && annotation.creator) { annotation.author += e.text; continue; }
			add(e.text, true);
			continue;
		}
		if (e.t === 'close') {
			const name = e.name;
			if (skip) { skip--; continue; }
			switch (name) {
				case 'text:p': case 'text:h': {
					const t = stack.pop();
					if (!t) break;
					if (insertions > 0 && !deleting) { t.p.markRev = REV_INS; }
					if (t.hidden) { found.hidden++; break; }
					if (t.into === main && main.length >= MAX_PARAS) throw new Error('This OpenDocument file has more paragraphs than import can hold (500,000).');
					// (a paragraph inside another's frame, a text box's, comes after the paragraph it stands in)
					const outer = top();
					if (outer && outer.into === t.into) outer.after.push(t.p, ...t.after);
					else t.into.push(t.p, ...t.after);
					break;
				}
				case 'text:span': spans.pop(); break;
				case 'text:a': hrefs.pop(); break;
				case 'table:table': tbl--; break;
				case 'text:list': listDepth--; listStyle.pop(); break;
				case 'text:table-of-content': case 'text:alphabetical-index': case 'text:illustration-index': case 'text:table-index': case 'text:object-index': case 'text:user-index': case 'text:bibliography': toc--; break;
				case 'text:note-citation': citation = false; break;
				case 'text:note-body': if (inNote) into = inNote.was; break;
				case 'text:note': if (inNote) { const n = inNote; inNote = null; push({ kind: 'note', id: n.id, end: n.end }); } break;
				case 'dc:creator': if (annotation) annotation.creator = false; break;
				case 'office:annotation': if (annotation) {
					const a = annotation; annotation = null; into = a.was;
					const id = String(comments.size + 1);
					comments.set(id, { author: a.author.trim(), text: a.paras.map((p) => p.runs.map((r) => (r.kind === 'text' ? r.text : '')).join('')).join(' ').replace(/\s+/g, ' ').trim() });
					found.comments++;
					if (a.name) named.set(a.name, id); else push({ kind: 'comment-end', id });
				} break;
				case 'text:deletion': if (region) deletions.set(region, deleting ?? []); deleting = null; into = main; break;
				case 'text:changed-region': region = null; break;
				case 'office:binary-data': { const frame = frameOf(); if (binary !== null && frame) {
					try { inline.set(frame.bin, Uint8Array.from(atob(binary.replace(/\s/g, '')), (c) => c.charCodeAt(0))); } catch { frame.bin = ''; frame.object = true; }
				} binary = null; } break;
				case 'draw:frame': { const f = frames.pop(); if (f) {
					// (a chart or an embedded object is counted, as a picture of another kind; a frame of text only is its text)
					if (f.object) { found.pictures++; push({ kind: 'picture' }); }
					else if (f.bin || f.image) { found.pictures++; push({ kind: 'picture', rid: f.bin || f.image || undefined }); }
				} } break;
				default: break;
			}
			continue;
		}
		const { name, attrs: a } = e;
		// (an empty element's close comes as one too, so every open counts)
		if (skip) { skip++; continue; }
		switch (name) {
			// what holds no text of the book, or only a program's own; and the number the outline or a list gives a
			// heading or an item (`text:number`), written out by the program: not the writer's words
			case 'text:number': case 'text:sequence-decls': case 'text:variable-decls': case 'text:user-field-decls': case 'office:forms': case 'office:scripts': case 'office:font-face-decls':
			case 'text:table-of-content-source': case 'text:alphabetical-index-source': case 'text:illustration-index-source': case 'text:table-index-source': case 'text:object-index-source': case 'text:user-index-source': case 'text:bibliography-source':
			case 'office:change-info': case 'text:format-change': case 'svg:title': case 'svg:desc': case 'office:meta': case 'office:settings': case 'office:master-styles':
				if (!e.empty) skip = 1;
				break;
			case 'office:styles': case 'office:automatic-styles': {
				// (in a flat file the styles are inline: read them as styles.xml would be)
				const start = content.indexOf(`<${name}`), end = content.indexOf(`</${name}>`, start);
				if (!e.empty && start >= 0 && end > start) { readStyles(content.slice(start, end + name.length + 3)); skip = 1; }
				break;
			}
			case 'text:changed-region': region = a['text:id'] ?? a['xml:id'] ?? null; break;
			case 'text:insertion': if (region) regionKind.set(region, 'ins'); break;
			case 'text:deletion': if (region) { regionKind.set(region, 'del'); deleting = []; into = deleting; } break;
			case 'text:change-start': if (regionKind.get(a['text:change-id'] ?? '') === 'ins') { insertions++; found.inserted++; } break;
			case 'text:change-end': if (regionKind.get(a['text:change-id'] ?? '') === 'ins') insertions = Math.max(0, insertions - 1); break;
			case 'text:change': putBack(a['text:change-id'] ?? ''); break;
			case 'text:p': case 'text:h': {
				const lvl = name === 'text:h' ? Math.max(1, Math.min(9, Number(a['text:outline-level'] ?? 1) || 1)) - 1 : null;
				const o = blank(a['text:style-name'] ?? null, lvl);
				if (name === 'text:h') o.p.numbered = a['text:is-list-header'] !== 'true' && !!outlineNumbered.get(lvl ?? 0);
				else if (listDepth > 0) { const st = listStyle.find(Boolean) ?? first(chain('paragraph', o.style), 'list') ?? ''; o.p.list = { id: 1, level: listDepth - 1, ordered: !!lists.get(st)?.get(listDepth - 1) }; o.p.numbered = true; }
				if (deleting) o.into = deleting;
				else if (annotation) o.into = annotation.paras;
				// (an empty one is closed by the event that follows it, like any other: popping it here as well would end
				// the paragraph it stands in, a shape's, and lose the words after)
				stack.push(o);
				break;
			}
			case 'text:span': spans.push(a['text:style-name'] ?? ''); break;
			case 'text:a': hrefs.push(/^(https?:|mailto:)/i.test(a['xlink:href'] ?? '') ? a['xlink:href'] : undefined); break;
			case 'text:s': add(' '.repeat(Math.min(1000, Math.max(1, Number(a['text:c'] ?? 1) || 1))), false); break;
			case 'text:tab': push({ kind: 'tab' }); break;
			case 'text:line-break': push({ kind: 'br', page: false }); break;
			case 'text:soft-page-break': break;
			case 'table:table': tbl++; found.tables++; break;
			case 'text:list': listDepth++; listStyle.push(a['text:style-name'] ?? ''); break;
			case 'text:table-of-content': case 'text:alphabetical-index': case 'text:illustration-index': case 'text:table-index': case 'text:object-index': case 'text:user-index': case 'text:bibliography': toc++; break;
			case 'text:note': {
				const end = a['text:note-class'] === 'endnote', id = ++noteId;
				if (end) found.endnotes++;
				inNote = { id, end, was: into };
				notes.set(end ? -1 - id : id, []);
				break;
			}
			case 'text:note-citation': if (!e.empty) citation = true; break;
			case 'text:note-body': if (inNote) into = notes.get(inNote.end ? -1 - inNote.id : inNote.id) ?? []; break;
			case 'office:annotation': if (!e.empty) annotation = { name: a['office:name'] ?? '', author: '', paras: [], creator: false, was: into }; break;
			case 'dc:creator': if (annotation) annotation.creator = true; else if (!e.empty) skip = 1; break;
			case 'dc:date': case 'meta:date-string': if (!e.empty) skip = 1; break;
			case 'office:annotation-end': { const id = named.get(a['office:name'] ?? ''); if (id) push({ kind: 'comment-end', id }); break; }
			case 'text:hidden-text': if (a['text:is-hidden'] !== 'false') found.hidden++; else add(a['text:string-value'] ?? '', false); if (!e.empty) skip = 1; break;
			case 'text:hidden-paragraph': { const t = top(); if (t && a['text:is-hidden'] !== 'false') t.hidden = true; if (!e.empty) skip = 1; break; }
			case 'draw:frame': frames.push({ image: null, object: false, bin: '' }); break;
			case 'draw:image': { const frame = frameOf(); if (frame && frame.image === null && !frame.object) frame.image = a['xlink:href'] ?? ''; break; }
			case 'draw:object': case 'draw:object-ole': { const frame = frameOf(); if (frame) frame.object = true; if (!e.empty) skip = 1; break; }
			// (a flat file's picture, written out in base64 where it stands)
			case 'office:binary-data': { const frame = frameOf(); if (frame && !e.empty) { frame.bin = `bin${inline.size + 1}`; binary = ''; } break; }
			case 'draw:text-box': found.textBoxes++; break;
			default: break;
		}
	}

	const picture: DocxFile['picture'] = (rid) => {
		if (inline.has(rid)) { const bytes = inline.get(rid) ?? new Uint8Array(); return { ext: bytes[0] === 0x89 ? 'png' : bytes[0] === 0xff ? 'jpg' : 'bin', load: () => bytes }; }
		if (!/^Pictures\//.test(rid)) return null;
		return { ext: (/\.([A-Za-z0-9]+)$/.exec(rid)?.[1] ?? '').toLowerCase(), load: () => media(rid) };
	};
	return { producer, paras: main, notes, comments, picture, found };
}
