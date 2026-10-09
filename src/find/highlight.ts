import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { findPlain, type FindOptions, type Hit } from './search';

/* How a match is shown. In an editor: a decoration with the classes Obsidian's own find bar gives its match, so a
   theme that styles those styles ours. In text that is drawn (a section of the manuscript that is no editor, a card,
   the scenes before and after a note in focus mode): the browser's own highlights (`CSS.highlights`), which change
   nothing in the page. Without them (iOS before 17.2, an old WebView) each match is wrapped in a `<mark>` instead,
   taken off again before the next mark is drawn: the text a section draws is thrown away when it is drawn again, so
   nothing of ours outlasts it. */

/** The matches to show in an editor: all of them, and which is the one the writer is on. */
export const setFound = StateEffect.define<{ from: number; to: number; current: boolean }[]>();

const mark = Decoration.mark({ class: 'binders-find-match' });
const current = Decoration.mark({ class: 'cm-highlight obsidian-search-match-highlight binders-find-match is-current' });

const field = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		value = value.map(tr.changes);
		for (const e of tr.effects) if (e.is(setFound)) {
			const len = tr.state.doc.length;
			value = Decoration.set(e.value.filter((r) => r.from < r.to && r.to <= len).map((r) => (r.current ? current : mark).range(r.from, r.to)), true);
		}
		return value;
	},
	provide: (f) => EditorView.decorations.from(f),
});

export const foundExtension: Extension = field;

/** Does this editor show matches (is the extension in it)? */
export const shows = (cm: EditorView): boolean => cm.state.field(field, false) !== undefined;

// ---- drawn text ----

interface Highlights { set(name: string, h: unknown): void; delete(name: string): void }
const registry = (doc: Document): Highlights | null => {
	const css = (doc.defaultView as unknown as { CSS?: { highlights?: Highlights } } | null)?.CSS;
	return css?.highlights && typeof (doc.defaultView as unknown as { Highlight?: unknown }).Highlight === 'function' ? css.highlights : null;
};

/** Where `query` stands in what an element shows, as ranges of the page. What an embed draws of another note, and what
    a link draws as the name of what it leads to, are passed over; as in a note's text, a match wholly inside a tag
    (after its `#`), code, or where a link leads is no match. */
export function rangesIn(el: HTMLElement, query: string, o: FindOptions): Range[] {
	const doc = el.ownerDocument, walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: { node: Text; at: number }[] = [], guarded: Hit[] = [];
	let text = '';
	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		const p = n.parentElement;
		if (!p || p.closest('.internal-embed, .binders-find-flair')) continue;
		const at = text.length, len = n.data.length;
		const a = p.closest('a.internal-link, a.external-link');
		if (a) {
			const href = a.getAttribute('data-href') ?? a.getAttribute('href') ?? '';
			if ((a.textContent ?? '').replace(/ > /g, '#') === href) guarded.push({ from: at, to: at + len });
		} else if (p.closest('a.tag')) guarded.push({ from: at + (n.data.startsWith('#') ? 1 : 0), to: at + len });
		else if (p.closest('code, pre')) guarded.push({ from: at, to: at + len });
		nodes.push({ node: n, at });
		text += n.data;
	}
	if (!nodes.length) return [];
	const out: Range[] = [];
	let i = 0;
	const place = (p: number, end: boolean): [Text, number] => {
		while (i + 1 < nodes.length && (end ? nodes[i + 1].at < p : nodes[i + 1].at <= p)) i++;
		return [nodes[i].node, p - nodes[i].at];
	};
	for (const h of findPlain(text, query, o, guarded)) {
		const r = doc.createRange(), a = place(h.from, false);
		r.setStart(a[0], a[1]);
		const b = place(h.to, true);
		r.setEnd(b[0], b[1]);
		out.push(r);
	}
	return out;
}

interface Painted { doc: Document; all: Range[]; current: Range | null; marks: HTMLElement[] }
const painted = new Map<object, Painted>();

/** Wraps each text a range covers in a `<mark>` (where there are no highlights to draw with). */
function wrap(p: Painted): HTMLElement | null {
	let at: HTMLElement | null = null;
	for (const r of [...p.all].reverse()) {
		const pieces: { node: Text; from: number; to: number }[] = [];
		const walker = p.doc.createTreeWalker(r.commonAncestorContainer.nodeType === Node.TEXT_NODE ? r.commonAncestorContainer.parentNode ?? r.commonAncestorContainer : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
			if (!r.intersectsNode(n)) continue;
			const from = n === r.startContainer ? r.startOffset : 0, to = n === r.endContainer ? r.endOffset : n.length;
			if (to > from) pieces.push({ node: n, from, to });
		}
		const now = r === p.current;
		for (const x of pieces.reverse()) {
			const mid = x.from > 0 ? x.node.splitText(x.from) : x.node;
			if (x.to - x.from < mid.length) mid.splitText(x.to - x.from);
			const mark = createEl('mark', { cls: now ? 'binders-find-mark is-current' : 'binders-find-mark' });
			mid.replaceWith(mark);
			mark.appendChild(mid);
			p.marks.push(mark);
			if (now) at = mark;
		}
	}
	return at;
}

function unwrap(p: Painted): void {
	for (const m of p.marks) {
		const parent = m.parentNode;
		if (!parent) continue;
		while (m.firstChild) parent.insertBefore(m.firstChild, m);
		parent.removeChild(m);
		parent.normalize();
	}
	p.marks = [];
}

/** Shows matches in drawn text (`owner`: whose they are). `find` is asked for the ranges after the last marks are taken
    off (a `<mark>` splits the text it is in, and ranges taken before would be left in pieces): given none, or none
    found, the owner's marks go. Returns the element the match the writer is on is in, to scroll to. */
export function paint(owner: object, doc: Document, find: () => { all: Range[]; current: Range | null } | null): HTMLElement | null {
	const was = painted.get(owner);
	if (was) unwrap(was);
	const got = find();
	if (got && (got.all.length || got.current)) painted.set(owner, { doc, all: got.all, current: got.current, marks: [] }); else painted.delete(owner);
	const reg = registry(doc), now = painted.get(owner) ?? null;
	const to = now?.current ? now.current.startContainer.parentElement : null;
	if (!reg) return now ? wrap(now) ?? to : null;
	const H = (doc.defaultView as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
	const mine = [...painted.values()].filter((p) => p.doc === doc);
	const every = mine.flatMap((p) => p.all.filter((r) => r !== p.current)), on = mine.flatMap((p) => (p.current ? [p.current] : []));
	if (every.length) reg.set('binders-find', new H(...every)); else reg.delete('binders-find');
	if (on.length) reg.set('binders-find-current', new H(...on)); else reg.delete('binders-find-current');
	return to;
}

export function unpaint(owner: object): void {
	const was = painted.get(owner);
	if (was) paint(owner, was.doc, () => null);
}

/** Does this page draw matches with the browser's highlights (else with marks)? */
export const highlightsSupported = (doc: Document): boolean => registry(doc) !== null;
