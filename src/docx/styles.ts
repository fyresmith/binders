import { events } from './xml';

/* A Word file's styles, as far as import asks about them: a paragraph style's built-in name (Word keeps "heading 1"
   in the name when a localised Word changes the id), its outline level, alignment and indents, and a character
   style's bold or italic, each through the chain of `basedOn`. And the lists' numbering: whether a level counts or
   has a bullet. Pure. */

export interface Style {
	id: string;
	/** Lower case, as Word's built-in name ("heading 1", "title", "normal"). */
	name: string;
	type: string;
	basedOn: string | null;
	outline: number | null;
	align: string | null;
	first: number | null; left: number | null; right: number | null;
	pageBefore: boolean;
	b: boolean | null; i: boolean | null; caps: boolean | null;
}
export type Styles = ReadonlyMap<string, Style>;

const on = (v: string | undefined): boolean => v === undefined || !/^(0|false|off)$/i.test(v);
const num = (v: string | undefined): number | null => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : null; };

export function readStyles(xml: string | null): Map<string, Style> {
	const out = new Map<string, Style>();
	if (!xml) return out;
	let cur: Style | null = null, inPPr = false, inRPr = false;
	for (const e of events(xml)) {
		if (e.t === 'close') {
			if (e.name === 'w:style') cur = null;
			else if (e.name === 'w:pPr') inPPr = false;
			else if (e.name === 'w:rPr') inRPr = false;
			continue;
		}
		if (e.t !== 'open') continue;
		const a = e.attrs;
		if (e.name === 'w:style') {
			cur = { id: a['w:styleId'] ?? '', name: '', type: a['w:type'] ?? 'paragraph', basedOn: null, outline: null, align: null, first: null, left: null, right: null, pageBefore: false, b: null, i: null, caps: null };
			if (cur.id) out.set(cur.id, cur);
		} else if (!cur) continue;
		else if (e.name === 'w:name') cur.name = (a['w:val'] ?? '').toLowerCase();
		else if (e.name === 'w:basedOn') cur.basedOn = a['w:val'] ?? null;
		else if (e.name === 'w:pPr') inPPr = true;
		else if (e.name === 'w:rPr') inRPr = true;
		else if (inPPr && e.name === 'w:outlineLvl') cur.outline = num(a['w:val']);
		else if (inPPr && e.name === 'w:jc') cur.align = a['w:val'] ?? null;
		else if (inPPr && e.name === 'w:pageBreakBefore') cur.pageBefore = on(a['w:val']);
		else if (inPPr && e.name === 'w:ind') {
			const hang = num(a['w:hanging']);
			cur.first = hang ? -hang : num(a['w:firstLine']) ?? cur.first;
			cur.left = num(a['w:left'] ?? a['w:start']) ?? cur.left;
			cur.right = num(a['w:right'] ?? a['w:end']) ?? cur.right;
		} else if (inRPr && e.name === 'w:b') cur.b = on(a['w:val']);
		else if (inRPr && e.name === 'w:i') cur.i = on(a['w:val']);
		else if (inRPr && e.name === 'w:caps') cur.caps = on(a['w:val']);
	}
	return out;
}

/** What a style is, with what its chain gives: the nearest that says wins. */
export function resolve(styles: Styles, id: string | null): Style {
	const out: Style = { id: id ?? '', name: '', type: 'paragraph', basedOn: null, outline: null, align: null, first: null, left: null, right: null, pageBefore: false, b: null, i: null, caps: null };
	const seen = new Set<string>();
	for (let s = id ? styles.get(id) : undefined, depth = 0; s && !seen.has(s.id) && depth < 24; s = s.basedOn ? styles.get(s.basedOn) : undefined, depth++) {
		seen.add(s.id);
		if (depth === 0) { out.name = s.name; out.type = s.type; }
		out.outline ??= s.outline; out.align ??= s.align; out.first ??= s.first; out.left ??= s.left; out.right ??= s.right;
		out.pageBefore ||= s.pageBefore; out.b ??= s.b; out.i ??= s.i; out.caps ??= s.caps;
	}
	return out;
}

/** The default paragraph style's id ("Normal" in most files), where a paragraph names none. */
export function defaultStyle(xml: string | null): string {
	if (!xml) return '';
	for (const e of events(xml)) if (e.t === 'open' && e.name === 'w:style' && e.attrs['w:default'] === '1' && (e.attrs['w:type'] ?? 'paragraph') === 'paragraph') return e.attrs['w:styleId'] ?? '';
	return '';
}

export interface Numbering { ordered(numId: number, level: number): boolean }
export function readNumbering(xml: string | null): Numbering {
	const abstracts = new Map<number, Map<number, string>>(), nums = new Map<number, number>();
	if (xml) {
		let abs = -1, num_ = -1, lvl = -1;
		for (const e of events(xml)) {
			if (e.t !== 'open') continue;
			if (e.name === 'w:abstractNum') { abs = Number(e.attrs['w:abstractNumId']); abstracts.set(abs, new Map()); num_ = -1; }
			else if (e.name === 'w:lvl') lvl = Number(e.attrs['w:ilvl'] ?? 0);
			else if (e.name === 'w:numFmt' && abs >= 0 && num_ < 0) abstracts.get(abs)?.set(lvl, e.attrs['w:val'] ?? '');
			else if (e.name === 'w:num') { num_ = Number(e.attrs['w:numId']); abs = -1; }
			else if (e.name === 'w:abstractNumId' && num_ >= 0) nums.set(num_, Number(e.attrs['w:val']));
		}
	}
	return { ordered: (numId, level) => { const fmt = abstracts.get(nums.get(numId) ?? -1)?.get(level) ?? abstracts.get(nums.get(numId) ?? -1)?.get(0); return !!fmt && fmt !== 'bullet' && fmt !== 'none'; } };
}
