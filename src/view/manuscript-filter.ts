import { TFile, TFolder } from 'obsidian';
import type { ModeContext } from './mode';

/* The manuscript under a filter says what it left out and what it would leave out now. Before a section (or a folder's
   heading) that doesn't follow the one above it in the book, a line says how many notes lie between ("2 notes not shown",
   their names in its tooltip and to a screen reader); on a section that no longer matches, a line under its title says
   so. Each is a child of the section's own element, so the page's order, and the editor with the cursor, are never touched. */

const NAMES = 20;
const say = (files: TFile[]): string => `${files.length} ${files.length === 1 ? 'note' : 'notes'} not shown`;
const named = (files: TFile[]): string => files.slice(0, NAMES).map((f) => f.basename).join(', ') + (files.length > NAMES ? ` and ${files.length - NAMES} more` : '');

export function markManuscript(ctx: ModeContext, entries: { key: TFile | TFolder; el: HTMLElement }[]): void {
	const byKey = new Map(entries.map((e) => [e.key, e.el]));
	const gaps = new Map<HTMLElement, TFile[]>();
	const scenes = new Set(ctx.store.scenes(ctx.folder));
	let skipped: TFile[] = [], last: HTMLElement | null = null;
	const reach = (el: HTMLElement) => { if (skipped.length) gaps.set(el, skipped); skipped = []; last = el; };
	const walk = (folder: TFolder) => {
		for (const c of ctx.store.orderedChildren(folder) ?? []) {
			const el = byKey.get(c as TFile | TFolder);
			if (c instanceof TFolder) { if (el) reach(el); walk(c); }
			else if (el) reach(el);
			else if (c instanceof TFile && scenes.has(c)) skipped.push(c);
		}
	};
	if (ctx.filtering()) walk(ctx.folder);
	const tail = skipped, lastEl: HTMLElement | null = last;
	const put = (el: HTMLElement, cls: string, files: TFile[] | undefined, end: boolean) => {
		let g = el.querySelector<HTMLElement>(`:scope > .${cls}`);
		if (!files?.length) { g?.remove(); return; }
		if (!g) {
			g = createDiv({ cls: `binders-manuscript-gap ${cls}`, attr: { role: 'note', tabindex: '0' } });
			g.createSpan({ cls: 'binders-manuscript-gap-text' });
		}
		if (end ? g !== el.lastElementChild : g !== el.firstElementChild) { if (end) el.append(g); else el.prepend(g); }
		const text = g.querySelector<HTMLElement>('.binders-manuscript-gap-text');
		if (text && text.textContent !== say(files)) text.setText(say(files));
		g.setAttr('aria-label', `${say(files)}: ${named(files)}`);
		g.setAttr('title', named(files));
	};
	for (const e of entries) {
		put(e.el, 'is-before', gaps.get(e.el), false);
		put(e.el, 'is-after', e.el === lastEl ? tail : undefined, true);
		if (!(e.key instanceof TFile)) continue;
		const stale = !!ctx.stale?.(e.key);
		e.el.toggleClass('is-unmatched', stale);
		let m = e.el.querySelector<HTMLElement>(':scope > .binders-manuscript-unmatched');
		if (!stale) { m?.remove(); continue; }
		if (!m) { m = createDiv({ cls: 'binders-manuscript-unmatched', text: 'No longer matches the filter' }); e.el.querySelector(':scope > .binders-manuscript-break')?.after(m); }
	}
}
