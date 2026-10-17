import { TFile, TFolder, type TAbstractFile } from 'obsidian';
import { playedIn, type Played } from '../inspector/roles';
import { storyKey, type StoryDate, type StoryPlace } from '../time/date';
import { saidRole } from './export-as';
import { isExported, isNote, nameOf, noteOf } from './actions';
import { labelName } from './labels';
import type { ModeContext, SceneProps } from './mode';
import { TITLE, addWords, earliest, flattenRows, progress, rankedKey, sortItems, text, propOf, type Sort } from './outliner-data';
import { readStory, storyPlace } from './props';

/* What the outliner knows about its rows: which there are (folded and filtered), in what order, and what each column
   holds for an item. The values come from the mode's context (the notes' properties, the word counts, the story dates);
   the sorting, folding and adding up are plain functions in outliner-data.ts. Nothing here draws or writes. */

export interface Row { item: TFile | TFolder; depth: number }

const NO_PROPS: SceneProps = { synopsis: '', status: '', label: '', target: 0 };

/** What the model asks of the outliner: how it is sorted, and which folders are folded. */
export interface OutlinerPrefs {
	sort(): Sort;
	collapsed(): Set<string>;
}

export class OutlinerModel {
	constructor(private ctx: ModeContext, private prefs: OutlinerPrefs) {}

	private get store() { return this.ctx.store; }
	private get settings() { return this.ctx.plugin.settings; }
	/** The labels and statuses of this binder: its own, if it keeps them, else the vault's. */
	private get labels() { return this.ctx.store.labelsOf(this.ctx.binder); }
	private get statuses() { return this.ctx.store.statusesOf(this.ctx.binder); }
	private get longform(): boolean { return this.ctx.binder.kind === 'longform'; }

	children(folder: TFolder): (TFile | TFolder)[] {
		return (this.store.orderedChildren(folder) ?? []).filter((f): f is TFile | TFolder => f instanceof TFolder || isNote(f));
	}

	/** Every subfolder under a folder, at any depth. */
	folders(folder: TFolder): TFolder[] {
		const out: TFolder[] = [];
		const walk = (f: TFolder) => { for (const c of this.children(f)) if (c instanceof TFolder) { out.push(c); walk(c); } };
		if (!this.longform) walk(folder);
		return out;
	}

	/** Items in the order the sort puts them (each folder's own items among themselves); binder order without one. */
	sorted<T extends TAbstractFile>(list: T[]): T[] {
		return sortItems(list, this.prefs.sort(), (f, id) => this.sortValue(f, id), (f) => this.storyPlace(f));
	}

	rows(): Row[] {
		const sort = this.prefs.sort();
		if (this.longform) {
			// one flat folder; scenes are indented as in Longform (sorted, they're one list)
			const scenes = this.store.groups(this.ctx.folder).flatMap((g) => g.files.map((f) => ({ f, depth: g.depth }))).filter((s) => this.ctx.visible(s.f));
			if (!sort) return scenes.map((s) => ({ item: s.f, depth: s.depth }));
			return this.sorted(scenes.map((s) => s.f)).map((f) => ({ item: f, depth: 0 }));
		}
		return flattenRows<TFile | TFolder, TFolder>(this.ctx.folder, {
			children: (f) => this.children(f),
			isFolder: (i): i is TFolder => i instanceof TFolder,
			pathOf: (i) => i.path,
			shows: (n) => n instanceof TFile && this.ctx.visible(n),
			// (with a filter on, a folder shows for the notes in it that pass)
			holdsShown: (f) => this.store.scenes(f).some((n) => this.ctx.visible(n)),
			order: (list) => this.sorted(list),
		}, this.prefs.collapsed(), this.ctx.filtering());
	}

	props(item: TAbstractFile): SceneProps { const n = noteOf(this.ctx, item); return n ? this.ctx.props(n) : NO_PROPS; }
	frontmatter(item: TAbstractFile): Record<string, unknown> { const n = noteOf(this.ctx, item); return (n && this.ctx.app.metadataCache.getFileCache(n)?.frontmatter) || {}; }

	/** The part an item plays in the book (inspector/roles.ts: worked out once for the binder, until something changes). */
	played(item: TAbstractFile): Played | null { return playedIn(this.ctx.plugin, this.ctx.binder).get(item.path) ?? null; }
	/** Does the item itself say it is left out of an export (not a folder above it)? */
	leftOut(item: TAbstractFile): boolean { const fm = this.frontmatter(item); return fm.export === false || fm.compile === false; }

	/** Words in a note, or in every note of a folder; null until they're all counted. */
	words(item: TAbstractFile): number | null {
		if (item instanceof TFile) return this.ctx.words(item);
		if (!(item instanceof TFolder)) return null;
		return addWords(this.scenesIn(item), (f) => this.ctx.words(f));
	}

	/** The notes in a folder that show: all of them, or with a filter on, the ones that pass (so a folder's row adds
	    up what's under it on screen, as the last row does). */
	scenesIn(folder: TFolder): TFile[] {
		const all = this.store.scenes(folder);
		return this.ctx.filtering() ? all.filter((f) => this.ctx.visible(f)) : all;
	}

	/** Unfinished revision tasks about an item: a note's own, a folder's about it or anything in it (with a filter on, the
	    notes that show). The whole folder shown (`book`): those, and at the top of the binder the tasks about the book. A
	    task about two scenes is counted once. */
	revision(item: TAbstractFile, book = false): number {
		const rev = this.ctx.plugin.revision;
		if (!rev || this.longform) return 0;
		if (item instanceof TFile || (!book && !this.ctx.filtering())) return rev.openFor(item);
		if (!(item instanceof TFolder)) return 0;
		const keys = new Set([item.path, ...this.scenesIn(item).map((f) => f.path), ...this.folders(item).map((f) => f.path)]);
		const top = book && item === this.ctx.binder.folder && !this.ctx.filtering(), seen = new Set<unknown>();
		for (const g of rev.list(this.ctx.binder).groups) {
			if (!(g.place.kind === 'item' && keys.has(g.place.key)) && !(top && g.place.kind === 'book')) continue;
			for (const t of g.tasks) if (!t.done) seen.add(t);
		}
		return seen.size;
	}

	/** An item's target: its own, or for a folder without one, its notes' targets together (`own` false). */
	target(item: TAbstractFile): { n: number; own: boolean } {
		const own = this.props(item).target;
		if (own > 0 || !(item instanceof TFolder)) return { n: own, own: true };
		return { n: this.scenesIn(item).reduce((a, f) => a + this.ctx.props(f).target, 0), own: false };
	}

	/** An item's story date as its property holds it. A folder without a date of its own takes the earliest of its notes'
	    (`own` false): it is placed there, and not written. */
	story(item: TAbstractFile): { raw: unknown; date: StoryDate | null; own: boolean } {
		const here = readStory(this.ctx.plugin, noteOf(this.ctx, item));
		if (here.raw !== undefined || !(item instanceof TFolder)) return { ...here, own: true };
		return { raw: undefined, date: earliest(this.scenesIn(item).map((f) => readStory(this.ctx.plugin, f).date)), own: false };
	}

	/** Where an item is in story time: its date and order, a folder's by its earliest note when it has none. */
	storyPlace(item: TAbstractFile): StoryPlace | null {
		const own = storyPlace(this.ctx.plugin, noteOf(this.ctx, item));
		if (own || !(item instanceof TFolder)) return own;
		const d = this.story(item).date;
		return d ? { date: d, order: null } : null;
	}

	/** The property a column shows: a property's own column, or the notes (under the name settings give them). */
	propFor(id: string): string | null { return id === 'notes' ? this.settings.notesProp : propOf(id); }

	sortValue(item: TAbstractFile, id: string): unknown {
		const p = this.props(item);
		switch (id) {
			case TITLE: return nameOf(item);
			// in the order settings list them, then by name
			case 'label': return p.label ? rankedKey(p.label, this.labels.map((l) => l.name), labelName(p.label, this.labels)) : '';
			case 'status': return p.status ? rankedKey(p.status, this.statuses, p.status) : '';
			case 'words': return this.words(item);
			case 'target': return this.target(item).n || null;
			case 'progress': return progress(this.words(item), this.target(item).n);
			case 'created': return item instanceof TFile ? item.stat.ctime : null;
			case 'modified': return item instanceof TFile ? item.stat.mtime : null;
			// (a note that has none, or something that isn't a date, comes last whichever way the column runs)
			case 'storydate': { const d = this.story(item).date; return d ? storyKey(d, this.ctx.store.calendarOf(this.ctx.binder)) : null; }
			case 'export': return isExported(this.ctx.plugin, item);
			case 'revision': return this.revision(item) || null;
			case 'role': return saidRole(this.played(item)).text;
		}
		const prop = this.propFor(id), v = prop ? this.frontmatter(item)[prop] : null;
		return Array.isArray(v) ? text(v) : v;
	}

	/** What a cell shows, for telling whether its row needs drawing again. */
	cellKey(item: TAbstractFile, id: string): unknown {
		switch (id) {
			case 'label': case 'status': return null; // in the row's props
			case 'words': return this.words(item);
			case 'target': return this.target(item);
			case 'progress': return [this.words(item), this.target(item).n];
			case 'created': return item instanceof TFile ? item.stat.ctime : null;
			case 'modified': return item instanceof TFile ? item.stat.mtime : null;
			case 'storydate': { const s = this.story(item); return [s.raw ?? null, s.own, s.date ? storyKey(s.date, this.ctx.store.calendarOf(this.ctx.binder)) : null]; }
			case 'export': return [isExported(this.ctx.plugin, item), this.leftOut(item)];
			case 'revision': return this.revision(item);
			case 'role': { const p = this.played(item); return p ? `${p.role}|${p.said ?? ''}` : null; }
		}
		const prop = this.propFor(id);
		return prop ? this.frontmatter(item)[prop] ?? null : null;
	}
}
