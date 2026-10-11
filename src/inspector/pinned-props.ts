import { Menu, Notice, setIcon, type TAbstractFile, type TFile } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { ask } from '../view/modals';
import { suggestProps, text } from '../view/outliner-data';
import { writeKeys } from '../view/props';
import { movedPin, ownNames, PINS_PROP, pinProblem, readPins, withoutPin, withPin } from './pins';
import { isListKind } from './property-fields';
import { drawValue, kindOf } from './property-widgets';

/* The writer's own properties in the inspector: a binder pins a few (POV, characters, a place), and each is a row under
   the pane's own, drawn as the rows of a note's Properties are. Which are pinned is the binder note's `inspector`, a
   list of names (pins.ts): view setup that belongs to the binder, so a card can read it later, and not part of the
   undo history. A Longform project pins nothing: its index note is Longform's, and is never written. */

/** What the pane gives the rows: where an item's properties are, and when the keyboard has left them. */
export interface PinnedHost {
	/** Where an item's properties are: the note, a folder's folder note (null until it has one). */
	noteOf(item: TAbstractFile): TFile | null;
	/** The same, made (a folder's note, as the outliner makes it on a first edit) when there is none. */
	noteFor(item: TAbstractFile): Promise<TFile>;
	/** A change ended and the keyboard left the rows: draw what waited. */
	settled(): void;
}

const blank = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && isNaN(v));
const same = (a: unknown, b: unknown): boolean => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b);

/** The names pinned by a binder, in order. */
export function pinsOf(plugin: BindersPlugin, binder: Binder): string[] {
	if (binder.kind !== 'binder') return [];
	return readPins(plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter?.[PINS_PROP]);
}

/** Changes the list in the binder note, from what the note says now: never in a Longform project's index note or a
    binder of a newer format, and never to anything but the `inspector` property. A refusal is a notice. */
async function changePins(plugin: BindersPlugin, binder: Binder, edit: (raw: unknown) => unknown[] | undefined): Promise<void> {
	try {
		if (binder.kind !== 'binder') throw new Error('A Longform project can’t pin properties. Convert it to a binder to use them.');
		if (binder.problem) throw new Error(`This binder can’t be changed. ${binder.problem}`);
		await plugin.binders.editProps(binder.note, (fm) => {
			const next = edit(fm[PINS_PROP]);
			if (next === undefined) delete fm[PINS_PROP]; else fm[PINS_PROP] = next;
		});
	} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
}

export class PinnedRows {
	constructor(private plugin: BindersPlugin, private host: PinnedHost) {}

	/** Is one of the rows' editors in use (the keyboard in it)? Then the pane doesn't draw over it. */
	busy(root: HTMLElement): boolean {
		const at = root.doc.activeElement;
		return !!at && Array.from(root.querySelectorAll('.binders-pinned-value')).some((v) => v.contains(at));
	}

	/** Lets go of the keyboard, which gives what was being typed to the note it was typed for. */
	release(root: HTMLElement): void { const at = root.doc.activeElement; if (at?.instanceOf(HTMLElement) && this.busy(root)) at.blur(); }

	/** The pinned rows, after the pane's own in `rows`, and under them (in `foot`) the way to pin another. */
	draw(rows: HTMLElement, foot: HTMLElement, binder: Binder, items: TAbstractFile[]): void {
		const { plugin } = this, pins = pinsOf(plugin, binder), ro = !!binder.problem;
		for (const key of pins) this.row(rows, binder, items, key, ro);
		if (binder.kind !== 'binder') {
			foot.createDiv({ cls: 'binders-inspector-none binders-inspector-hint binders-pinned-hint', text: 'A Longform project can’t pin properties. Convert it to a binder to use them.' });
			return;
		}
		if (ro) return;
		// Obsidian's own "Add property", as it stands under a note's properties
		const add = foot.createDiv({ cls: 'metadata-add-button text-icon-button binders-pinned-add', attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'menu' } });
		add.dataset.field = 'pin';
		setIcon(add.createSpan({ cls: 'text-button-icon' }), 'lucide-plus');
		add.createSpan({ cls: 'text-button-label', text: 'Pin property' });
		const open = () => { const m = new Menu(), r = add.getBoundingClientRect(); this.pinItems(m, binder, pins); m.showAtPosition({ x: r.left, y: r.bottom + 2 }, add.doc); };
		add.addEventListener('click', open);
		add.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
	}

	/** The properties this binder's notes have, most used first, to pin; and any other by its name. */
	private pinItems(m: Menu, binder: Binder, pins: string[]): void {
		const { plugin } = this, s = plugin.settings, own = ownNames(s);
		const all = plugin.binders.scenes(binder.folder).map((f) => plugin.app.metadataCache.getFileCache(f)?.frontmatter ?? {});
		// (Obsidian's own aliases and cssclasses are not a writer's fields)
		const found = suggestProps(all, [...own, ...pins, 'aliases', 'cssclasses']);
		for (const p of found.slice(0, 12)) {
			const sample: unknown = all.find((fm) => fm[p] != null)?.[p];
			m.addItem((i) => i.setSection('props').setTitle(p).setIcon(kindOf(plugin.app, p, sample).icon).onClick(() => void changePins(plugin, binder, (raw) => withPin(raw, p))));
		}
		if (!found.length) m.addItem((i) => i.setSection('props').setTitle('No other properties in this binder’s notes').setDisabled(true));
		m.addItem((i) => i.setSection('add').setTitle('Other property...').setIcon('plus').onClick(async () => {
			const name = await ask(plugin.app, { title: 'Pin a property', placeholder: 'A property’s name, such as POV', cta: 'Pin', empty: 'A row needs a property’s name.', check: (v) => pinProblem(v, readPins(plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter?.[PINS_PROP]), s) });
			if (name) await changePins(plugin, binder, (raw) => withPin(raw, name));
		}));
	}

	private row(rows: HTMLElement, binder: Binder, items: TAbstractFile[], key: string, ro: boolean): void {
		const { plugin } = this, app = plugin.app;
		const fmOf = (f: TAbstractFile): Record<string, unknown> => { const n = this.host.noteOf(f); return (n && app.metadataCache.getFileCache(n)?.frontmatter) || {}; };
		const values = items.map((f) => fmOf(f)[key]), sample = values.find((v) => v != null && v !== '');
		const info = kindOf(app, key, sample);

		const row = rows.createDiv({ cls: 'metadata-property binders-pinned' });
		row.dataset.propertyKey = key.toLowerCase();
		row.dataset.propertyType = info.kind;
		// the name: the property's own, as the note's Properties and the outliner's column have it; its menu moves and unpins
		const k = row.createDiv({ cls: 'metadata-property-key binders-pinned-key', attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'menu', 'aria-label': `${key}: ${info.name.toLowerCase()}` } });
		k.dataset.field = `pin:${key}`;
		setIcon(k.createSpan({ cls: 'metadata-property-icon' }), info.icon);
		k.createSpan({ cls: 'binders-inspector-key', text: key });
		if (!ro) {
			const menu = (e?: MouseEvent) => {
				e?.preventDefault();
				const m = new Menu(), pins = pinsOf(plugin, binder), at = pins.findIndex((p) => p.toLowerCase() === key.toLowerCase());
				m.addItem((i) => i.setSection('info').setTitle(`${info.name} property`).setIcon(info.icon).setDisabled(true));
				m.addItem((i) => i.setSection('move').setTitle('Move up').setIcon('arrow-up').setDisabled(at <= 0).onClick(() => void changePins(plugin, binder, (raw) => movedPin(raw, key, -1))));
				m.addItem((i) => i.setSection('move').setTitle('Move down').setIcon('arrow-down').setDisabled(at < 0 || at >= pins.length - 1).onClick(() => void changePins(plugin, binder, (raw) => movedPin(raw, key, 1))));
				m.addItem((i) => i.setSection('unpin').setTitle('Unpin').setIcon('pin-off').onClick(() => void changePins(plugin, binder, (raw) => withoutPin(raw, key))));
				const r = k.getBoundingClientRect();
				if (e && e.type === 'contextmenu') m.showAtMouseEvent(e); else m.showAtPosition({ x: r.left, y: r.bottom + 2 }, k.doc);
			};
			k.addEventListener('click', () => menu());
			k.addEventListener('contextmenu', menu);
			k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(); } });
		}

		const value = row.createDiv({ cls: 'metadata-property-value binders-pinned-value' });
		value.dataset.propertyType = info.is;
		value.dataset.field = `prop:${key}`;

		const one = items.length === 1 ? items[0] : null, first = values[0];
		if (!one || ro) {
			// (several at once are changed together: the next step)
			const agree = values.every((v) => same(v, first));
			value.createDiv({ cls: 'binders-inspector-value', text: agree ? text(first) : 'Mixed' });
		} else {
			// what is written is this item's note, as it was when the row was drawn: the pane may have turned to another
			// item by the time a save is made, and it goes where it was opened
			const changed = (to: unknown): void => { void this.write(one, key, to); };
			const drawn = drawValue(app, value, first ?? null, { key, sourcePath: this.host.noteOf(one)?.path ?? binder.note.path, onChange: changed, kind: info.kind });
			value.addEventListener('focusout', () => value.win.setTimeout(() => { if (!value.contains(value.doc.activeElement)) this.host.settled(); }, 0));
		}
		// a value that isn't what its type says: Obsidian's own mark, and its words
		if (items.length === 1 && info.mismatch && !blank(first)) {
			const warn = row.createDiv({ cls: 'clickable-icon metadata-property-warning-icon', attr: { 'aria-label': `Type mismatch, expected ${info.name}` } });
			setIcon(warn, 'lucide-alert-triangle');
		}
	}

	/** Writes one item's value, as one step of the undo history; nothing typed there is a value to keep, so a cleared
	    one takes the property away. A folder with no folder note has nothing to take away: one isn't made to hold nothing. */
	private async write(item: TAbstractFile, key: string, to: unknown): Promise<void> {
		try {
			const note = this.host.noteOf(item) ?? (blank(to) ? null : await this.host.noteFor(item));
			if (!note) return;
			const own = this.plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[key] as unknown;
			if (same(own, to)) return;
			await writeKeys(this.plugin, [{ file: note, patch: { [key]: blank(to) ? undefined : to } }]);
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}
}
