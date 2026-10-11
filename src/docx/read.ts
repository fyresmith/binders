import { partText, readPackage, type Package } from './package';
import { defaultStyle, readNumbering, readStyles, resolve, type Numbering, type Styles } from './styles';
import { events } from './xml';

/* A .docx read into paragraphs, exactly as the file has them, with every tracked change and comment anchor still
   in place: this reader never resolves a revision. `settle` (settle.ts) is what import calls; an "editor's changes"
   feature would read this directly. Pure.
   What is read: the main part's paragraphs in order (tables and text boxes included, a text box once: Word writes it
   twice, in `mc:Choice` and its `mc:Fallback`, and only the first is read), runs with bold, italic, strike and
   underline, tabs and breaks, links, footnotes and endnotes, the lists' numbering, styles through their chains,
   fields and content controls that make a table of contents. What is not read, and counted so it can be said:
   headers and footers, pictures, text in shapes that aren't text boxes. */

export interface Rev { kind: 'ins' | 'del' | 'moveFrom' | 'moveTo'; author: string; date: string; id: string }
export type DocxRun = (
	| { kind: 'text'; text: string; b: boolean; i: boolean; s: boolean; u: boolean; href?: string }
	| { kind: 'tab' }
	| { kind: 'br'; page: boolean }
	| { kind: 'note'; id: number; end: boolean }
	| { kind: 'picture' }
) & { rev?: Rev };
export type DocxMark = { kind: 'comment-start' | 'comment-end'; id: string };
export interface DocxPara {
	/** The paragraph style's built-in name, lower case ("heading 1", "title", "normal"), never its id. */
	style: string;
	outline: number | null;
	align: string | null;
	/** Word starts a page here: by the style, the paragraph, or a section that ended before it. */
	pageBefore: boolean;
	indent: { first: number; left: number; right: number };
	list: { id: number; level: number; ordered: boolean } | null;
	runs: (DocxRun | DocxMark)[];
	/** Its paragraph mark was inserted or deleted (a deleted mark joins it to the next). */
	markRev?: Rev;
	/** In a table of contents: by its style, a field or a content control. */
	toc: boolean;
	inTable: boolean;
	textBox: boolean;
}
export interface DocxFile {
	/** The program that wrote it, from the file's own account ("Microsoft Office Word", "LibreOffice", "Binders"). */
	producer: string;
	paras: DocxPara[];
	/** Footnotes and endnotes by their id in the file. */
	notes: Map<number, DocxPara[]>;
	found: { inserted: number; deleted: number; comments: number; underlined: number; italic: number; headers: boolean; textBoxes: number; tables: number; pictures: number; endnotes: number };
}

/** The most paragraphs a file may hold. */
export const MAX_PARAS = 500_000;

const on = (v: string | undefined): boolean => v === undefined || !/^(0|false|off|none)$/i.test(v);
const int = (v: string | undefined): number => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };

interface Ctx { styles: Styles; numbering: Numbering; rels: Package['rels']; fallback: string; found: DocxFile['found'] }

/** One part's paragraphs. `into`: where a footnote's or endnote's paragraphs go, by id (the main part: null). */
function body(xml: string, c: Ctx, into: Map<number, DocxPara[]> | null): DocxPara[] {
	const out: DocxPara[] = [], stack: { p: DocxPara; tocAtStart: boolean }[] = [];
	const path: string[] = [];
	const revs: Rev[] = [], fields: { instr: string }[] = [], sdts: boolean[] = [];
	let skip = 0, href: string | undefined, tbl = 0, textBox = 0, nextPage = false, note = -1;
	let run: { b: boolean; i: boolean; s: boolean; u: boolean; rStyle: string | null } | null = null, collecting: 't' | 'instr' | null = null;
	const top = () => stack[stack.length - 1];
	const tocNow = () => fields.some((f) => /^\s*TOC\b/i.test(f.instr)) || sdts.some(Boolean);
	const rev = (): Rev | undefined => revs[revs.length - 1];
	const push = (r: DocxRun) => { const t = top(); if (!t) return; const v = rev(); if (v) r.rev = v; t.p.runs.push(r); };
	const add = (text: string) => {
		const t = top();
		if (!t || !run) return;
		const st = resolve(c.styles, run.rStyle);
		const b = run.b || st.b === true, i = run.i || st.i === true;
		if (run.u && text.trim()) c.found.underlined++;
		if (i && text.trim()) c.found.italic++;
		const last = t.p.runs[t.p.runs.length - 1];
		const r: DocxRun = { kind: 'text', text, b, i, s: run.s, u: run.u, ...(href ? { href } : {}) };
		const v = rev();
		if (v) r.rev = v;
		// (runs that are alike are one: Word splits a word at every edit)
		if (last && last.kind === 'text' && !('id' in last) && last.b === b && last.i === i && last.s === run.s && last.u === run.u && last.href === r.href && last.rev === r.rev) last.text += text;
		else t.p.runs.push(r);
		t.tocAtStart ||= tocNow();
	};
	for (const e of events(xml)) {
		if (e.t === 'text') {
			if (skip) continue;
			if (collecting === 't') add(e.text);
			else if (collecting === 'instr' && fields.length) fields[fields.length - 1].instr += e.text;
			continue;
		}
		if (e.t === 'close') {
			const name = e.name;
			path.pop();
			if (skip) { if (name === 'mc:Fallback') skip--; continue; }
			if (name === 'w:t' || name === 'w:delText' || name === 'w:instrText') collecting = null;
			else if (name === 'w:r') run = null;
			else if (name === 'w:p') {
				const s = stack.pop();
				if (!s) continue;
				if (out.length >= MAX_PARAS) throw new Error('This Word file has more paragraphs than import can hold (500,000).');
				s.p.toc ||= s.tocAtStart;
				if (!into) out.push(s.p); else if (note >= 0) into.get(note)?.push(s.p);
			} else if (name === 'w:ins' || name === 'w:del' || name === 'w:moveFrom' || name === 'w:moveTo') { if (!path.includes('w:pPr')) revs.pop(); }
			else if (name === 'w:hyperlink') href = undefined;
			else if (name === 'w:tbl') tbl--;
			else if (name === 'w:txbxContent') textBox--;
			else if (name === 'w:sdt') sdts.pop();
			else if (name === 'w:fldSimple') fields.pop();
			else if (name === 'w:footnote' || name === 'w:endnote') note = -1;
			continue;
		}
		const { name, attrs: a } = e;
		path.push(name);
		if (skip) { if (name === 'mc:Fallback') skip++; continue; }
		if (name === 'mc:Fallback') { skip = 1; continue; }
		if (name === 'w:footnote' || name === 'w:endnote') {
			const kind = a['w:type'];
			note = kind === 'separator' || kind === 'continuationSeparator' || kind === 'continuationNotice' ? -1 : int(a['w:id']);
			if (into && note >= 0 && !into.has(note)) into.set(note, []);
			continue;
		}
		if (into && note < 0 && name !== 'w:footnotes' && name !== 'w:endnotes') { if (name === 'w:p') { stack.push({ p: blank(c), tocAtStart: false }); } continue; }
		const t = top();
		switch (name) {
			case 'w:p': stack.push({ p: { ...blank(c), inTable: tbl > 0, textBox: textBox > 0, pageBefore: nextPage }, tocAtStart: tocNow() }); nextPage = false; break;
			case 'w:tbl': tbl++; c.found.tables++; break;
			case 'w:txbxContent': textBox++; c.found.textBoxes++; break;
			case 'w:sdt': sdts.push(false); break;
			case 'w:docPartGallery': if (/table of contents/i.test(a['w:val'] ?? '') && sdts.length) sdts[sdts.length - 1] = true; break;
			case 'w:fldSimple': fields.push({ instr: a['w:instr'] ?? '' }); break;
			case 'w:fldChar': { const k = a['w:fldCharType']; if (k === 'begin') fields.push({ instr: '' }); else if (k === 'end') fields.pop(); break; }
			case 'w:instrText': collecting = 'instr'; break;
			case 'w:hyperlink': { const rel = a['r:id'] ? c.rels.get(a['r:id']) : undefined; href = rel?.external ? rel.target : undefined; break; }
			case 'w:ins': case 'w:del': case 'w:moveFrom': case 'w:moveTo': {
				const r: Rev = { kind: name.slice(2) as Rev['kind'], author: a['w:author'] ?? '', date: a['w:date'] ?? '', id: a['w:id'] ?? '' };
				if (path.includes('w:rPr') && path.includes('w:pPr')) { if (t) t.p.markRev = r; if (r.kind === 'ins' || r.kind === 'moveTo') c.found.inserted++; else c.found.deleted++; } else if (path.includes('w:pPr')) { /* (a revision of the paragraph's own properties) */ } else {
					revs.push(r);
					if (r.kind === 'ins' || r.kind === 'moveTo') c.found.inserted++; else c.found.deleted++;
				}
				break;
			}
			case 'w:r': run = { b: false, i: false, s: false, u: false, rStyle: null }; break;
			case 'w:commentRangeStart': case 'w:commentRangeEnd': if (t) t.p.runs.push({ kind: name === 'w:commentRangeStart' ? 'comment-start' : 'comment-end', id: a['w:id'] ?? '' }); if (name === 'w:commentRangeStart') c.found.comments++; break;
			case 'w:tab': if (run && t && path[path.length - 2] === 'w:r') push({ kind: 'tab' }); break;
			case 'w:br': case 'w:cr': if (run && t) push({ kind: 'br', page: a['w:type'] === 'page' }); break;
			case 'w:noBreakHyphen': add('-'); break;
			case 'w:footnoteReference': case 'w:endnoteReference': if (t) { push({ kind: 'note', id: int(a['w:id']), end: name === 'w:endnoteReference' }); if (name === 'w:endnoteReference') c.found.endnotes++; } break;
			case 'w:drawing': case 'w:pict': if (t && !path.includes('w:txbxContent')) { push({ kind: 'picture' }); c.found.pictures++; } break;
			case 'w:t': case 'w:delText': collecting = 't'; break;
			default: break;
		}
		const cur = top();
		if (!cur) continue;
		// ---- properties ----
		if (path.includes('w:rPr') && run && !path.includes('w:pPr')) {
			if (name === 'w:b') run.b = on(a['w:val']);
			else if (name === 'w:i') run.i = on(a['w:val']);
			else if (name === 'w:strike' || name === 'w:dstrike') run.s = on(a['w:val']);
			else if (name === 'w:u') run.u = on(a['w:val']);
			else if (name === 'w:rStyle') run.rStyle = a['w:val'] ?? null;
		} else if (path.includes('w:pPr')) {
			const p = cur.p;
			if (name === 'w:pStyle') p.style = a['w:val'] ?? '';
			else if (name === 'w:outlineLvl') { const n = int(a['w:val']); p.outline = n >= 0 && n <= 8 ? n : null; }
			else if (name === 'w:jc') p.align = a['w:val'] ?? null;
			else if (name === 'w:pageBreakBefore') p.pageBefore = on(a['w:val']);
			else if (name === 'w:ind') { p.indent = { first: a['w:hanging'] ? -int(a['w:hanging']) : a['w:firstLine'] !== undefined ? int(a['w:firstLine']) : p.indent.first, left: a['w:left'] !== undefined || a['w:start'] !== undefined ? int(a['w:left'] ?? a['w:start']) : p.indent.left, right: a['w:right'] !== undefined || a['w:end'] !== undefined ? int(a['w:right'] ?? a['w:end']) : p.indent.right }; (p as DocxPara & { directInd?: true }).directInd = true; }
			else if (name === 'w:ilvl') p.list = { id: p.list?.id ?? 0, level: int(a['w:val']), ordered: false };
			else if (name === 'w:numId') p.list = int(a['w:val']) ? { id: int(a['w:val']), level: p.list?.level ?? 0, ordered: false } : null;
			else if (name === 'w:sectPr') nextPage = true;
		}
	}
	return out;
}

/** A paragraph before its own properties are read: the fields filled in later, from its style. */
function blank(_c: Ctx): DocxPara {
	return { style: '', outline: null, align: null, pageBefore: false, indent: { first: 0, left: 0, right: 0 }, list: null, runs: [], toc: false, inTable: false, textBox: false };
}

/** Styles' words applied to a paragraph: its style's name instead of its id, and what the style gives where the paragraph says nothing. */
function styled(paras: DocxPara[], c: Ctx): void {
	for (const p of paras) {
		const direct = p as DocxPara & { directInd?: true };
		const st = resolve(c.styles, p.style || c.fallback);
		p.style = st.name || (p.style || c.fallback).toLowerCase();
		if (/^toc \d/.test(p.style) || p.style === 'toc heading' || p.style === 'table of contents') p.toc = true;
		if (p.outline === null && st.outline !== null && st.outline <= 8) p.outline = st.outline;
		p.align ??= st.align;
		if (st.pageBefore) p.pageBefore = true;
		if (!direct.directInd) p.indent = { first: st.first ?? 0, left: st.left ?? 0, right: st.right ?? 0 };
		delete direct.directInd;
		if (p.list) p.list.ordered = c.numbering.ordered(p.list.id, p.list.level);
	}
}

export function readDocx(bytes: Uint8Array): DocxFile {
	const pkg = readPackage(bytes);
	const part = (name: string) => partText(pkg, name);
	const dir = pkg.main.slice(0, pkg.main.lastIndexOf('/') + 1);
	const byType = (suffix: string): string | null => { const r = [...pkg.rels.values()].find((x) => !x.external && x.type.endsWith(suffix)); return r ? partText(pkg, r.target) : null; };
	const stylesXml = byType('/styles') ?? part(`${dir}styles.xml`);
	const styles = readStyles(stylesXml);
	const found: DocxFile['found'] = { inserted: 0, deleted: 0, comments: 0, underlined: 0, italic: 0, headers: false, textBoxes: 0, tables: 0, pictures: 0, endnotes: 0 };
	const c: Ctx = { styles, numbering: readNumbering(byType('/numbering') ?? part(`${dir}numbering.xml`)), rels: pkg.rels, fallback: defaultStyle(stylesXml), found };
	const mainXml = partText(pkg, pkg.main);
	if (mainXml === null) throw new Error('This zip file isn’t a Word file: it has no document in it.');
	const paras = body(mainXml, c, null);
	styled(paras, c);
	const notes = new Map<number, DocxPara[]>();
	for (const [suffix, endnotes] of [['/footnotes', false], ['/endnotes', true]] as const) {
		const xml = byType(suffix) ?? part(`${dir}${suffix.slice(1)}.xml`);
		if (!xml) continue;
		const map = new Map<number, DocxPara[]>();
		body(xml, c, map);
		// (an endnote's id is kept apart from a footnote's: both count from 1)
		for (const [id, list] of map) notes.set(endnotes ? -1 - id : id, list);
	}
	for (const list of notes.values()) styled(list, c);
	found.headers = pkg.names.some((n) => /^word\/(header|footer)\d*\.xml$/i.test(n));
	const app = part('docProps/app.xml') ?? '';
	const producer = /<Application>([^<]*)<\/Application>/.exec(app)?.[1] ?? '';
	return { producer, paras, notes, found };
}
