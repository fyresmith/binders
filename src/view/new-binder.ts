import { Notice, SuggestModal, TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { freeName, makeFrom, structures, type Structure } from '../structures';

/* "New binder": Obsidian's own prompt, as "Insert template" has it (the maintainer's choice, 2026-10-15, direction A
   of the design round). "Empty binder" first, so Enter is what New binder always made; then Binders' two templates,
   then the writer's, the binders kept in the templates folder, each with that folder at its row's end as the quick
   switcher names a folder. The binder is made at once, as "Untitled binder", and named in the file explorer. A
   template made by a newer Binders is listed and says so, and is not made from. */

type Row = Structure | null;

const EMPTY = { name: 'Empty binder', note: 'Nothing in it yet' };
const nameOf = (s: Row): string => (s ? s.name : EMPTY.name);
const noteOf = (s: Row): string => (s ? (s.problem ? 'Made by a newer version of Binders' : s.note) : EMPTY.note);
/** Where a template of the writer's is kept ("Templates"); "" for Binders' own. */
const whereOf = (s: Row): string => (s?.folder ? s.folder.parent?.path ?? '' : '');

export class StartPicker extends SuggestModal<Row> {
	constructor(plugin: BindersPlugin, private rows: Row[], private choose: (s: Row) => void) {
		super(plugin.app);
		this.setPlaceholder('Start a new binder from...');
		this.setInstructions([{ command: '↑↓', purpose: 'to navigate' }, { command: '↵', purpose: 'to make it' }, { command: 'esc', purpose: 'to dismiss' }]);
		this.modalEl.addClass('binders-start-picker');
		this.emptyStateText = 'No template by that name.';
	}
	getSuggestions(q: string): Row[] {
		const t = q.trim().toLowerCase();
		return t ? this.rows.filter((r) => nameOf(r).toLowerCase().includes(t)) : this.rows;
	}
	renderSuggestion(s: Row, el: HTMLElement): void {
		el.addClass('mod-complex');
		const c = el.createDiv({ cls: 'suggestion-content' });
		c.createDiv({ cls: 'suggestion-title', text: nameOf(s) });
		c.createDiv({ cls: 'suggestion-note', text: noteOf(s) });
		const where = whereOf(s);
		if (where) el.createDiv({ cls: 'suggestion-aux' }).createSpan({ cls: 'suggestion-flair', text: where });
	}
	onChooseSuggestion(s: Row): void { this.choose(s); }
}

/** Asks what the new binder starts from and makes it in `parent`; `made` is given its folder. */
export function newBinder(plugin: BindersPlugin, parent: TFolder, made: (folder: TFolder) => void): void {
	const rows: Row[] = [null, ...structures(plugin)];
	new StartPicker(plugin, rows, (s) => {
		if (s?.problem) { new Notice(`“${s.name}” can’t be made into a binder. ${s.problem}`, 8000); return; }
		void makeFrom(plugin, parent, freeName(plugin.app, parent, 'Untitled binder'), s).then(made, (e) => new Notice(e instanceof Error ? e.message : String(e)));
	}).open();
}
