import { EditorView } from '@codemirror/view';
import type { MarkdownView } from 'obsidian';
import type BindersPlugin from '../main';
import { paint, rangesIn, setFound, shows, unpaint } from '../find/highlight';
import { takeSnapshot } from '../snapshots';
import { FindBar, type FindHost, type FindSource } from '../view/find-bar';

/* Find in a note that shows the scenes before and after it (focus mode's "Show the scenes before and after"): the
   one case where Binders takes the place of Obsidian's own bar in a note's tab. What is shown is what is looked
   through: the end of the scene before, the note, the start of the scene after, in that order. A match in a
   neighbour is marked in its drawn text and gone to; nothing is replaced there (it isn't an editor, and it is a part
   of another note). Only this view, only while its neighbours show: `showSearch` is put back as it was after. */

type Searching = MarkdownView & { showSearch(replace?: boolean): void };

/** Takes over "Search current file" in this note's tab while its neighbours show. Returns how to give it back. */
export function hookSearch(plugin: BindersPlugin, view: MarkdownView, near: () => HTMLElement[]): () => void {
	const v = view as Searching, had = Object.prototype.hasOwnProperty.call(v, 'showSearch');
	const own = (replace?: boolean): void => (Object.getPrototypeOf(v) as Searching).showSearch.call(v, replace);
	let bar: FindBar | null = null;
	const owner = {};
	const drawn = (cls: string): HTMLElement | null => near().find((el) => el.hasClass(cls))?.querySelector<HTMLElement>('.binders-focus-near-text') ?? null;
	const cm = (): EditorView | null => (view.editor as unknown as { cm?: EditorView }).cm ?? null;
	const host: FindHost = {
		plugin,
		steps: () => 'matches',
		sources: () => {
			const out: FindSource[] = [], b = drawn('is-before'), a = drawn('is-after'), f = view.file;
			if (b) out.push({ id: 'before', name: 'The scene before', file: null, drawn: b });
			if (f) out.push({ id: f.path, name: f.basename, file: f });
			if (a) out.push({ id: 'after', name: 'The scene after', file: null, drawn: a });
			return out;
		},
		here: () => { const c = cm(), f = view.file; return c && f ? { id: f.path, offset: c.state.selection.main.from } : null; },
		show: (state, go) => {
			const c = cm(), mine = state?.found.find((x) => x.source.file === view.file);
			if (c && shows(c)) c.dispatch({ effects: setFound.of(mine && c.state.doc.length === mine.text.length ? mine.hits.map((h, i) => ({ ...h, current: state?.at?.found === mine && state.at.hit === i })) : []) });
			const got: { cur: Range | null } = { cur: null };
			const to = paint(owner, view.containerEl.ownerDocument, () => {
				const all: Range[] = [];
				for (const f of state?.found ?? []) {
					if (!f.source.drawn) continue;
					const r = rangesIn(f.source.drawn, state?.query ?? '', state?.options ?? { matchCase: false });
					all.push(...r);
					if (state?.at?.found === f) got.cur = r[state.at.hit] ?? null;
				}
				return { all, current: got.cur };
			});
			if (!go || !state?.at) return;
			if (got.cur) { to?.scrollIntoView({ block: 'center' }); return; }
			if (c && state.at.found === mine) { const h = mine.hits[state.at.hit]; c.dispatch({ selection: { anchor: h.from, head: h.to }, effects: EditorView.scrollIntoView(h.from, { y: 'center' }) }); }
		},
		// (replace all here is this note alone, so the snapshot taken first is the note's own)
		snapshot: () => {
			const f = view.file;
			if (!f || plugin.binders.problem(f)) return null;
			return { of: 'note', name: f.basename, root: f.parent?.path ?? '', take: async (why) => { await takeSnapshot(plugin, f, why); } };
		},
		locked: () => (view.file && plugin.binders.problem(view.file) ? 'Nothing can be replaced here.' : null),
		replacesOne: () => true,
		replaceOne: async (at, by) => {
			const c = cm(), h = at.found.hits[at.hit];
			if (!c || at.found.source.drawn || c.state.doc.toString() !== at.found.text) return false;
			c.dispatch({ changes: { from: h.from, to: h.to, insert: by }, selection: { anchor: h.from + by.length }, userEvent: 'input.replace' });
			return true;
		},
		closed: () => { unpaint(owner); view.editor?.focus(); },
	};
	v.showSearch = (replace = false) => {
		// (reading view has Obsidian's own bar: there is no editor of ours to mark)
		if (view.getMode() !== 'source' || !near().some((el) => el.hasClass('is-before') || el.hasClass('is-after'))) { own(replace); return; }
		const sel = view.editor.getSelection();
		if (!bar) {
			bar = new FindBar(host, replace, () => { bar = null; });
			bar.el.addClass('binders-find-in-note');
			const src = view.contentEl.querySelector('.markdown-source-view');
			(src ?? view.contentEl).prepend(bar.el);
		} else if (replace && !bar.isReplacing) bar.setReplacing(true);
		bar.focus(sel || undefined, replace);
	};
	(v as unknown as { bindersFind?: () => FindBar | null }).bindersFind = () => bar;
	return () => {
		bar?.close();
		// (it had none of its own: its class's is in sight again)
		if (!had) delete (v as unknown as { showSearch?: unknown }).showSearch;
		delete (v as unknown as { bindersFind?: unknown }).bindersFind;
	};
}
