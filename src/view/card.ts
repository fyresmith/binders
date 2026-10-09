import { TFile, TFolder, setIcon, type TAbstractFile } from 'obsidian';
import { isNote, noteOf } from './actions';
import { editable, type Editable } from './edit';
import { labelDot, labelName, paintLabel } from './labels';
import type { ModeContext } from './mode';
import { progress } from './outliner-data';
import { wordsLabel } from './words';

/* An index card: a note's title, synopsis, status and word count (a folder's names the first things in it, and counts them all).
   The corkboard draws its cards with this, in its grid and arranged by label, so a card is the same card on either; the board
   says how its own parts work (what a rename does, when a click may edit) through `CardHost`. */

export interface CardHost {
	ctx: ModeContext;
	/** Renames the item (from the card's title, edited in place). Throws, with why, if the name can't be used. */
	rename(f: TAbstractFile, name: string): Promise<void>;
	/** A field of a card started (true) or stopped being edited: the board doesn't redraw meanwhile. */
	onEditing(on: boolean, card?: HTMLElement): void;
	/** May a click on this card's synopsis start editing it (say, only on a card that's already selected)? */
	editOnClick(card: HTMLElement): boolean;
}

/** The title and synopsis editors of a drawn card, kept so a redraw can update them in place. */
export interface CardEditors { title: Editable; synopsis: Editable }

/** The words in these notes, or null while any of them is still being counted. */
export function sumWords(ctx: ModeContext, files: TFile[]): number | null {
	let n = 0;
	for (const f of files) { const w = ctx.words(f); if (w == null) return null; n += w; }
	return n;
}

/** The notes among these that show: all of them, or with a filter on, the ones that pass it. */
export const passing = (ctx: ModeContext, scenes: TFile[]): TFile[] => (ctx.filtering() ? scenes.filter((f) => ctx.visible(f)) : scenes);

/** "3 notes · 51 words" for a folder; with a filter on, how many of them show ("2 of 3 notes"), and their words. */
export function countLabel(ctx: ModeContext, scenes: TFile[], folder?: TFolder): string {
	const shown = passing(ctx, scenes), n = sumWords(ctx, shown);
	const count = shown.length === scenes.length ? `${scenes.length} ${scenes.length === 1 ? 'note' : 'notes'}` : `${shown.length} of ${scenes.length} notes`;
	// a folder with a target of its own says how far along it is, as a card with one does
	const note = folder && shown.length === scenes.length ? ctx.store.folderNote(folder) : null, target = note ? ctx.props(note).target : 0;
	return count + (n == null ? '' : ' · ' + (target ? `${n.toLocaleString()} / ${wordsLabel(target)}` : wordsLabel(n)));
}

/** An item's synopsis, edited in place. A folder's is kept in its folder note (made the first time one is written). */
export function synopsisField(host: CardHost, parent: HTMLElement, item: TAbstractFile, cls: string, card?: HTMLElement, focusable = false): Editable {
	const ctx = host.ctx, note = noteOf(ctx, item);
	return editable(parent, {
		cls, value: note ? ctx.props(note).synopsis : '', placeholder: 'Add a synopsis', label: `Synopsis of ${item instanceof TFile ? item.basename : item.name}`, readOnly: ctx.readOnly, focusable,
		shouldEdit: () => !card || host.editOnClick(card),
		save: async (t) => {
			const f = item instanceof TFolder ? await ctx.store.ensureFolderNote(item) : note;
			await ctx.setProps(f, { synopsis: t });
		},
		onEditing: (on) => host.onEditing(on, card),
	});
}

/** How many of a folder's items its card names (a small card has room for fewer: the stylesheet cuts the list). */
const HELD = 5;

/** The first of what a folder holds, in the binder's order (under a filter, the notes that pass and every subfolder).
    Its notes and folders only, as the board shows them: a picture, a PDF or a canvas kept beside them isn't a card. */
export function held(ctx: ModeContext, folder: TFolder): TAbstractFile[] {
	const all = (ctx.store.orderedChildren(folder) ?? []).filter((c): c is TAbstractFile => c instanceof TFolder || isNote(c));
	return (ctx.filtering() ? all.filter((c) => !(c instanceof TFile) || ctx.visible(c)) : all).slice(0, HELD);
}

/** What a folder holds, on its card: its first items by name, each with its label's dot, as they are in the file
    explorer. (Not said aloud: the card's description already says how many there are.) */
function heldList(ctx: ModeContext, card: HTMLElement, folder: TFolder): void {
	const items = held(ctx, folder);
	if (!items.length) return;
	const list = card.createDiv({ cls: 'binders-card-held', attr: { 'aria-hidden': 'true' } });
	for (const c of items) {
		const row = list.createDiv({ cls: 'binders-card-held-item', attr: { 'data-path': c.path } });
		if (c instanceof TFolder) setIcon(row.createSpan({ cls: 'binders-card-held-icon' }), 'lucide-folder');
		row.createSpan({ cls: 'binders-card-held-name', text: c instanceof TFile ? c.basename : c.name });
		const note = noteOf(ctx, c), label = note ? ctx.props(note).label : '';
		if (label) labelDot(row, label, ctx.plugin.settings.labels);
	}
}

/** Draws an item's card (not yet in the page). */
export function buildCard(host: CardHost, f: TAbstractFile): { el: HTMLElement; editors: CardEditors } {
	const ctx = host.ctx, presets = ctx.plugin.settings.labels;
	const folder = f instanceof TFolder;
	const note = noteOf(ctx, f);
	const p = note ? ctx.props(note) : { synopsis: '', status: '', label: '', target: 0 };
	const name = f instanceof TFile ? f.basename : f.name;
	const card = createDiv({ cls: 'binders-card' + (folder ? ' is-stack' : ''), attr: { role: 'option', tabindex: '-1', 'data-path': f.path, 'aria-selected': 'false' } });
	paintLabel(card, p.label, presets);
	const head = card.createDiv({ cls: 'binders-card-head' });
	if (folder) setIcon(head.createSpan({ cls: 'binders-card-icon' }), 'lucide-folder');
	else head.createSpan({ cls: 'binders-card-number', attr: { 'aria-hidden': 'true' } }); // (filled in by the board)
	const title = editable(head, {
		cls: 'binders-card-title', value: name, placeholder: 'Title', label: 'Rename', singleLine: true, clickToEdit: false, readOnly: ctx.readOnly,
		save: (t) => host.rename(f, t), onEditing: (on) => host.onEditing(on, card),
	});
	card.setAttr('aria-label', name);
	// what a screen reader says after the name: what the card shows besides it
	const words = folder ? null : f instanceof TFile ? ctx.words(f) : null;
	// (a folder's card says what it holds, as printed on it)
	const holds = f instanceof TFolder ? countLabel(ctx, ctx.store.scenes(f), f) : null;
	const about = [p.status && `Status: ${p.status}`, p.label && `Label: ${labelName(p.label, presets)}`, holds, words != null && wordsLabel(words), p.target > 0 && `Target: ${wordsLabel(p.target)}`].filter(Boolean).join(', ');
	if (about) card.setAttr('aria-description', about);
	const editors = { title, synopsis: synopsisField(host, card, f, 'binders-card-synopsis', card) };
	if (f instanceof TFolder) heldList(ctx, card, f);
	const foot = card.createDiv({ cls: 'binders-card-footer' });
	if (p.status) foot.createSpan({ cls: 'binders-chip', text: p.status });
	foot.createDiv({ cls: 'binders-card-spacer' });
	if (folder) {
		foot.createSpan({ cls: 'binders-card-words', text: countLabel(ctx, ctx.store.scenes(f), f) });
	} else {
		const n = f instanceof TFile ? ctx.words(f) : null;
		// with a target of its own: how far along it is, as the count and as a line along the card's foot
		if (n != null) foot.createSpan({ cls: 'binders-card-words', text: p.target > 0 ? `${n.toLocaleString()} / ${wordsLabel(p.target)}` : wordsLabel(n) });
		const done = progress(n, p.target);
		card.toggleClass('has-target', done != null);
		card.toggleClass('is-complete', done != null && done >= 1);
		card.setCssProps({ '--binders-card-progress': done == null ? '' : `${Math.round(done * 100)}%` });
	}
	return { el: card, editors };
}

/** Everything a card shows: while it's the same, a board may use the card it drew last time again. */
export function cardKey(ctx: ModeContext, f: TAbstractFile): unknown[] {
	if (f instanceof TFolder) {
		const note = ctx.store.folderNote(f), p = note ? ctx.props(note) : null, scenes = ctx.store.scenes(f);
		// (with what its count says: under a filter that's the notes that pass, which the filter changes)
		// (and the items it names, with their labels)
		const names = held(ctx, f).map((c) => { const n = noteOf(ctx, c); return c.name + '\n' + (n ? ctx.props(n).label : ''); }).join('\n');
		return [f.path, 'folder', p?.synopsis, p?.status, p?.label, p?.target, scenes.length, sumWords(ctx, scenes), countLabel(ctx, scenes, f), names];
	}
	if (!(f instanceof TFile)) return [f.path];
	const p = ctx.props(f);
	return [f.path, p.synopsis, p.status, p.label, p.target, ctx.words(f)];
}

/** With "Number the cards" on, each note's card says its place among the notes that show, in the order they read
    (`cards`: the board's cards in that order; a folder's card has no number). */
export function numberCards(board: HTMLElement, cards: HTMLElement[], on: boolean): void {
	board.toggleClass('mod-numbers', on);
	let n = 0;
	for (const c of cards) {
		const el = c.querySelector<HTMLElement>(':scope > .binders-card-head > .binders-card-number');
		if (!el) continue;
		const text = on ? String(++n) : '';
		if (el.textContent !== text) el.setText(text);
	}
}

/** A board asked for the keyboard before it had a card to put it on gives it to its first card when one comes. Not if
    the keyboard has gone somewhere else since (a note being typed in beside the board): `on()` says whether the board
    is still owed it; the returned function stops watching. */
export function owedFocus(pane: HTMLElement, on: () => boolean, drop: () => void): () => void {
	const doc = pane.doc, left = (e: FocusEvent) => { if (on() && !pane.contains(e.target as Node | null)) drop(); };
	doc.addEventListener('focusin', left, true);
	return () => doc.removeEventListener('focusin', left, true);
}

/** The folder in the breadcrumb above a board that cards carried to (x, y) would go out to, at its end: the way out of
    the folder shown, a level up or more. Null if nothing there would take them (the folder they're in already, one
    that can't have them, a read-only binder, a Longform project, which has no folders). */
export function crumbAt(ctx: ModeContext, pane: HTMLElement, items: TAbstractFile[], x: number, y: number): { el: HTMLElement; folder: TFolder } | null {
	if (ctx.readOnly || ctx.binder.kind === 'longform') return null;
	const el = pane.doc.elementsFromPoint(x, y).map((e) => e.closest<HTMLElement>('.binders-crumb[data-path], .binders-crumb-up[data-path]')).find((e) => !!e && !!pane.parentElement?.contains(e)) ?? null;
	const up = el ? ctx.app.vault.getAbstractFileByPath(el.dataset.path ?? '') : null;
	return el && up instanceof TFolder && items.every((f) => f.parent !== up && ctx.store.whyNot(f, up) == null) ? { el, folder: up } : null;
}

/** The card the keyboard goes to when the one it's on leaves the board (moved to another folder, deleted): the next
    card in the board's order that stays, else the nearest before it; null if none stays. */
export function heir(order: readonly string[], path: string, going: (p: string) => boolean): string | null {
	const i = order.indexOf(path);
	if (i < 0) return null;
	return order.slice(i + 1).find((p) => !going(p)) ?? order.slice(0, i).reverse().find((p) => !going(p)) ?? null;
}

/** Is something being typed in (a note's editor beside the board, a field)? The keyboard is never taken from it. */
export function typingNow(doc: Document): boolean {
	const a = doc.activeElement;
	return !!a?.instanceOf(HTMLElement) && (a.isContentEditable || a.matches('input, textarea'));
}

/** Is the pointer over a board's pane (a little past its sides still counts)? A drop anywhere else moves nothing. */
export function overPane(pane: HTMLElement, x: number, y: number): boolean {
	const r = pane.getBoundingClientRect(), slack = 24;
	return x >= r.left - slack && x <= r.right + slack && y >= r.top && y <= r.bottom;
}
