import { Menu, Notice, setIcon, type TAbstractFile, type TFile } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { ask } from '../view/modals';
import { suggestProps, text } from '../view/outliner-data';
import { writeKeys } from '../view/props';
import { LONGFORM, movedPin, ownNames, PINS_PROP, pinProblem, readPins, withoutPin, withPin } from './pins';
import { isListKind, listOf, type Kind } from './property-fields';
import { changeLists, groupLists, type Group } from './mixed';
import { submenu } from '../view/internals';
import type { Env } from '../filter/conditions';
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
/** A list's item as a writer reads it: a link by its name. */
const shown = (item: string): string => { const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(item); return m ? (m[2] ?? m[1].split('/').pop() ?? m[1]) : item; };
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
		if (binder.kind !== 'binder') throw new Error(LONGFORM);
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
			foot.createDiv({ cls: 'binders-inspector-none binders-inspector-hint binders-pinned-hint', text: LONGFORM });
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
		const srcOf = (f: TAbstractFile): string => this.host.noteOf(f)?.path ?? binder.note.path;
		if (ro) {
			const agree = values.every((v) => same(v, first));
			value.createDiv({ cls: 'binders-inspector-value', text: agree ? text(first) : 'Mixed' });
		} else if (one) {
			// what is written is this item's note, as it was when the row was drawn: the pane may have turned to another
			// item by the time a save is made, and it goes where it was opened
			drawValue(app, value, first ?? null, { key, sourcePath: srcOf(one), onChange: (to) => { void this.write([{ item: one, to }], key); }, kind: info.kind });
		} else {
			this.several(value, items, key, info.kind, values, srcOf);
		}
		value.addEventListener('focusout', () => value.win.setTimeout(() => { if (!value.contains(value.doc.activeElement)) this.host.settled(); }, 0));
		// a value that isn't what its type says: Obsidian's own mark, and its words
		if (items.length === 1 && info.mismatch && !blank(first)) {
			const warn = row.createDiv({ cls: 'clickable-icon metadata-property-warning-icon', attr: { 'aria-label': `Type mismatch, expected ${info.name}` } });
			setIcon(warn, 'lucide-alert-triangle');
		}
	}

	/** Several items in hand: one editor for them. A list shows what all of them have, with a count of what only some
	    have; adding adds to all, the × takes from all. Any other type shows what they agree on, or "Mixed", and an edit
	    sets all of them. One step of the undo history. What is shown is kept up to date here as the writer edits, since
	    the pane is not drawn over a row the keyboard is in. */
	private several(value: HTMLElement, items: TAbstractFile[], key: string, kind: Kind, values: unknown[], srcOf: (f: TAbstractFile) => string): void {
		const app = this.plugin.app, vals = [...values], first = values[0];
		const envs = items.map((f): Env => ({ resolve: (l) => app.metadataCache.getFirstLinkpathDest(l, srcOf(f))?.path ?? null }));
		if (isListKind(kind)) {
			let g = groupLists(vals, envs), more: HTMLElement | null = null;
			const refresh = (): void => {
				more?.remove();
				more = g.some.length ? this.someHave(value, g, items, (item, to) => void (to ? apply(g.common, [...g.common, item]) : apply([item], []))) : null;
			};
			// what the list shared was `common`, and is `now`: the editor's whole list, or a menu pick (one item added to
			// everyone, or taken from everyone)
			const apply = async (common: string[], now: string[]): Promise<void> => {
				const next = changeLists(vals, envs, common, now);
				if (!next) return;
				await this.write(items.map((item, i) => ({ item, to: next[i] ?? vals[i] })).filter((_, i) => next[i]), key);
				next.forEach((n, i) => { if (n) vals[i] = n; });
				g = groupLists(vals, envs);
				refresh();
			};
			drawValue(app, value, g.common, { key, sourcePath: srcOf(items[0]), kind, onChange: (to) => { void apply(g.common, listOf(to)); } });
			refresh();
			return;
		}
		const agree = values.every((v) => same(v, first));
		drawValue(app, value, agree ? first ?? null : null, {
			key, sourcePath: srcOf(items[0]), kind,
			// (a field left as it was found says nothing: "Mixed" isn't a value to give them all)
			onChange: (to) => { if (agree ? same(to, first) : blank(to)) return; void this.write(items.map((item) => ({ item, to })), key); },
		});
		if (!agree) {
			value.addClass('is-mixed');
			const box = value.querySelector<HTMLInputElement>('input[type="checkbox"]');
			if (box) { box.indeterminate = true; box.setAttr('data-indeterminate', 'true'); }
			for (const f of Array.from(value.querySelectorAll<HTMLElement>('input, [contenteditable]'))) f.setAttr('placeholder', 'Mixed');
			// (a date field has no placeholder, only its mask: the word stands in its place until the field is gone into)
			if (kind === 'date' || kind === 'datetime') value.createSpan({ cls: 'binders-pinned-mixed', text: 'Mixed' });
		}
	}

	/** After a list several notes don't agree on: how many more items some of them have, and a menu to give one to
	    all of them or take it from all. */
	private someHave(value: HTMLElement, g: Group, items: TAbstractFile[], pick: (item: string, to: boolean) => void): HTMLElement {
		const box = value.querySelector<HTMLElement>('.multi-select-container') ?? value, input = box.querySelector('.multi-select-input');
		const n = g.some.length, of = items.length;
		const more = box.createDiv({ cls: 'binders-pinned-some', attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'menu' }, text: g.common.length ? `${n} more on some` : `${n} on some` });
		more.dataset.field = 'some';
		if (input?.parentElement === box) box.insertBefore(more, input);
		const open = (e: Event) => {
			e.preventDefault(); e.stopPropagation();
			const m = new Menu(), r = more.getBoundingClientRect();
			for (const s of g.some) {
				m.addItem((i) => {
					// (the name, and said at the row's end as a tree's row says things, how many have it)
					const title = createFragment((f) => { f.createSpan({ text: shown(s.item) }); f.createSpan({ cls: 'binders-pinned-count', text: `${s.count} of ${of}` }); });
					i.setSection('some').setTitle(title).setIcon(s.item.startsWith('[[') ? 'lucide-link' : 'lucide-text');
					submenu(i, (sub) => {
						sub.addItem((x) => x.setTitle(`Add to all ${of}`).setIcon('lucide-plus').onClick(() => pick(s.item, true)));
						sub.addItem((x) => x.setTitle(`Remove from the ${s.count} that ${s.count === 1 ? 'has' : 'have'} it`).setIcon('lucide-x').onClick(() => pick(s.item, false)));
					}, m);
				});
			}
			m.showAtPosition({ x: r.left, y: r.bottom + 2 }, more.doc);
		};
		more.addEventListener('click', open);
		more.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
		return more;
	}

	/** Writes what each item's value becomes, as one step of the undo history. Nothing typed there is a value to keep,
	    so a cleared one takes the property away. A folder with no folder note has nothing to take away: one isn't made
	    to hold nothing. */
	private async write(changes: { item: TAbstractFile; to: unknown }[], key: string): Promise<void> {
		try {
			const writes: { file: TFile; patch: Record<string, unknown> }[] = [];
			for (const { item, to } of changes) {
				const note = this.host.noteOf(item) ?? (blank(to) ? null : await this.host.noteFor(item));
				if (!note) continue;
				const own = this.plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[key] as unknown;
				if (same(own, to)) continue;
				writes.push({ file: note, patch: { [key]: blank(to) ? undefined : to } });
			}
			await writeKeys(this.plugin, writes);
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}
}
