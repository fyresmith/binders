import { TFile, TFolder } from 'obsidian';
import { editable, type Editable } from './edit';
import type { ModeContext } from './mode';

/* The manuscript showing each note's synopsis where its text would be (the Synopses switch): a read-through of the
   book's outline down its own page. A folder stays a heading with its synopsis under it; a note is its title and its
   synopsis. Each synopsis is the field the cards use (edit.ts), saved through the store as one step of Undo, so it is
   a property of the note and the note's text is never written from here. The switch itself, the editors it clears and
   the saving before it stay in manuscript.ts, with the editors' lifetime. */

/** A synopsis drawn on the page: its field, and the property as it was when it was last drawn (`read`), so that a
    change to the property from anywhere else is told from the page's own save arriving late. */
export interface Line { ed: Editable; read: string }

/** What the page keeps of a section or a folder's heading for its synopsis. */
export interface Shown {
	kind: 'scene' | 'heading';
	key: TFile | TFolder;
	el: HTMLElement;
	synopsis?: Line | null;
}

/** The class of every synopsis on the page. */
export const LINE = 'binders-manuscript-synopsis';

/** Is a synopsis of this entry being typed in? (Then its section stays on the page whatever the filter says, and the
    page does not draw it again.) */
export const typing = (e: Shown): boolean => !!e.synopsis?.ed.editing;

/** Draws the synopsis of a section (in `into`, its body) or of a folder's heading (in `into`, the heading, after
    `after`, its text): the property, or "Add a synopsis" where there is none. Drawn again only when the property has
    changed since it was drawn, and never while it is being typed in (what is typed wins, and is saved over the change).
    `again` is called when a field's editing ends, so a change that came meanwhile is drawn then. */
export function drawLine(ctx: ModeContext, e: Shown, into: HTMLElement, after: HTMLElement | null, again: () => void): void {
	const folder = e.key instanceof TFolder ? e.key : null, file = e.key instanceof TFile ? e.key : null;
	const note = folder ? ctx.store.folderNote(folder) : file;
	const value = note ? ctx.props(note).synopsis : '', had = e.synopsis;
	if (had?.ed.el.isConnected && (had.ed.editing || had.read === value)) return;
	const el = had?.ed.el, focused = !!el && (el === el.doc.activeElement);
	el?.remove();
	const name = folder?.name ?? file?.basename ?? '';
	const ed = editable(into, {
		cls: LINE, value, placeholder: 'Add a synopsis', label: `Synopsis of ${name}`, readOnly: ctx.readOnly, focusable: true,
		// (a folder's note is made when something is saved, and not before)
		save: async (t) => { const f = folder ? await ctx.store.ensureFolderNote(folder) : file; if (f) await ctx.setProps(f, { synopsis: t }); },
		onEditing: (on) => { if (on) ctx.selectionChanged?.(); else again(); },
	});
	e.synopsis = { read: value, ed };
	if (after && ed.el.previousElementSibling !== after) after.after(ed.el);
	if (focused) ed.el.focus({ preventScroll: true });
}

/** Takes a synopsis off the page (its field, if it was being typed in, is dropped with it: see the switch). */
export function clearLine(e: Shown): void {
	e.synopsis?.ed.el.remove();
	e.synopsis = null;
}
