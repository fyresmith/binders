import type { App, TFile, TFolder } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { COMPILE_PROP, EXPORT_PROP } from '../scenes';
import { readState, writeState, type StateProps } from '../filter/filter';
import { active, atom, emptyDef, kindFrom, linkOf, matches, same, say, wholeRows, type Atom, type Env, type FilterDef, type Kind } from '../filter/conditions';
import { propertyType } from './internals';
import { rank } from './labels';
import { readProps } from './props';
import { GREGORIAN, type Calendar } from '../time/date';

/* The subset of a binder a view shows: its filter (conditions.ts) over the notes of the binder, with what the filter
   needs from the vault, which its pure module asks for: a note's value for a property, the kind of a property, the note
   a link names. One per view. Everything it works out is kept until `invalidate()` (the view calls it when the binder
   has changed), so counting a thousand notes asks the vault once for each link. */

/** A thing a note can be filtered by: a property of the notes, or something the file itself says. */
export interface Field {
	id: string; title: string; kind: Kind; icon: string;
	/** Binders' own and the file's (listed apart from the notes' other properties). */
	own: boolean;
	/** The values in use in the binder (for text and list properties), most used first. */
	values: FieldValue[];
}
export interface FieldValue { raw: string; shown: string; count: number; link: boolean }

export const KIND_ICONS: Record<Kind, string> = { text: 'text', list: 'list', number: 'binary', date: 'calendar', checkbox: 'check-square' };
const FILE: { id: string; title: string; kind: Kind; icon: string }[] = [
	{ id: 'file.words', title: 'Words', kind: 'number', icon: 'whole-word' },
	{ id: 'file.name', title: 'Title', kind: 'text', icon: 'file' },
	{ id: 'file.folder', title: 'Folder', kind: 'text', icon: 'folder' },
	{ id: 'file.ctime', title: 'Created', kind: 'date', icon: 'calendar-plus' },
	{ id: 'file.mtime', title: 'Modified', kind: 'date', icon: 'calendar-clock' },
];
const day = (ms: number): string => { const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const nameOf = (target: string): string => target.split('/').pop() ?? target;
// (properties that are Binders' own bookkeeping, or Obsidian's, and no use to a writer's filter)
const HIDDEN = ['position', 'binder', 'contents', 'longform', COMPILE_PROP, 'aliases', 'cssclasses', 'plotlines', 'plotlineColors', 'plot', 'filters', 'exports'];

export class Subset {
	def: FilterDef = emptyDef();
	private kinds = new Map<string, Kind>();
	private links = new Map<string, string | null>();
	private catalogue: Field[] | null = null;

	/** `files`: the notes of the binder; `words`: a note's word count if it is known. */
	constructor(private plugin: BindersPlugin, private files: () => TFile[], private words: (f: TFile) => number | null) {}

	private get app(): App { return this.plugin.app; }
	/** The properties that hold status and label. */
	get props(): StateProps { const s = this.plugin.settings; return { status: s.statusProp, label: s.labelProp }; }

	/** The binder changed: what was worked out is worked out again. */
	invalidate(): void { this.kinds.clear(); this.links.clear(); this.catalogue = null; }

	// ---- the filter, as the view keeps it ----

	/** A view's saved filter (the old two lists, or conditions) as a filter; null if there was none. */
	read(saved: unknown): FilterDef | null {
		const s = this.plugin.settings;
		return readState(saved, s.statuses, s.labels.map((l) => l.name), this.props);
	}
	/** Takes a view's saved filter. False if there was none (the filter is as it was). What is remembered about the filter
	    (`seen`) is let go only if its conditions are not the same: a change of mode sets the state again and is no change. */
	load(saved: unknown): boolean {
		const def = this.read(saved);
		if (!def) return false;
		this.set(def);
		return true;
	}
	/** Puts a filter on; true if its conditions are not what they were (then the notes remembered are forgotten). */
	set(def: FilterDef): boolean {
		const changed = JSON.stringify([def.match, def.conditions]) !== JSON.stringify([this.def.match, this.def.conditions]);
		this.def = def;
		if (changed) this.seen.clear();
		return changed;
	}

	// ---- what stays until a refresh ----

	/** Notes that have passed the filter since it was put on. One that stops passing (its status set, a word too many) stays
	    where it is, said to match no longer, until the writer refreshes or changes the conditions: nothing leaves the page
	    by itself. */
	private seen = new Set<TFile>();
	/** Does the note show: it passes, or it has and no longer does. */
	shows(file: TFile): boolean {
		if (this.matches(file)) { this.seen.add(file); return true; }
		return this.seen.has(file);
	}
	/** Shown only because it used to pass. */
	stale(file: TFile): boolean { return this.seen.has(file) && !this.matches(file); }
	/** Lets go of the notes that no longer match, but the one being written in. */
	letGo(keep?: TFile | null): void {
		this.seen.clear();
		if (keep) this.seen.add(keep);
	}
	/** The filter as it goes in a view's state. */
	state(): unknown { return writeState(this.def, this.props); }

	/** Does the filter mean anything: has it a whole condition? (A row just added, with nothing picked, hides nothing.) */
	on(): boolean { return active(this.def, this.kindOf, this.cal); }
	/** How many conditions count. */
	count(): number { return wholeRows(this.def, this.kindOf, this.cal).length; }

	/** The filter in a few words, for a tooltip: "status is Draft, characters contains any of Mara". */
	say(): string {
		const word = this.def.match === 'any' ? ' or ' : this.def.match === 'none' ? ', nor ' : ', ';
		return (this.def.match === 'none' ? 'Not: ' : '') + wholeRows(this.def, this.kindOf, this.cal).map((c) => say(c, (p) => this.title(p), this.kindOf(c.property))).join(word);
	}
	/** What a property is called to the writer. */
	title(property: string): string {
		const s = this.plugin.settings;
		return property === s.statusProp ? 'Status' : property === s.labelProp ? 'Label' : property === s.targetProp ? 'Target' : property === s.storyDateProp ? 'Story date' : property === EXPORT_PROP ? 'Include in export' : FILE.find((f) => f.id === property)?.title ?? property;
	}

	// ---- matching ----

	/** The calendar the notes' story dates are in (their binder's). */
	private get cal(): Calendar { const f = this.files()[0]; return f ? this.plugin.binders.calendarOf(f) : GREGORIAN; }

	readonly env: Env = ((sub: Subset): Env => ({
		// (asked as the notes are matched: the binder note's calendar may have changed since the filter was put on)
		get cal(): Calendar { return sub.cal; },
		resolve: (link) => {
			let hit = sub.links.get(link);
			if (hit === undefined) { hit = sub.app.metadataCache.getFirstLinkpathDest(link, '')?.path ?? null; sub.links.set(link, hit); }
			return hit;
		},
	}))(this);

	/** The kind of a property: Binders' own and the file's are known; another is what Obsidian's type for it says, else what
	    the notes hold. */
	readonly kindOf = (property: string): Kind => {
		let k = this.kinds.get(property);
		if (k) return k;
		const s = this.plugin.settings;
		k = property === s.targetProp ? 'number' : property === s.storyDateProp ? 'date' : property === EXPORT_PROP ? 'checkbox' : property === s.statusProp || property === s.labelProp ? 'text' : FILE.find((f) => f.id === property)?.kind;
		if (!k) {
			k = propertyType(this.app, property) ?? kindFrom(this.files().map((f) => this.raw(f, property)), this.cal);
			// (a property Obsidian types as text but whose notes hold lists, or the reverse, is read as the notes have it)
			if (k === 'text' && this.files().some((f) => Array.isArray(this.raw(f, property)))) k = 'list';
		}
		this.kinds.set(property, k);
		return k;
	};

	private raw(file: TFile, property: string): unknown {
		return (this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined)?.[property];
	}

	/** A note's value for a property, as the conditions read it. */
	valueOf(file: TFile, property: string): unknown {
		const s = this.plugin.settings;
		if (property === 'file.words') return this.words(file) ?? undefined;
		if (property === 'file.name') return file.basename;
		if (property === 'file.folder') return file.parent?.name ?? '';
		if (property === 'file.ctime') return day(file.stat.ctime);
		if (property === 'file.mtime') return day(file.stat.mtime);
		// as settings spell them, whatever case the note has them in
		if (property === s.statusProp) return readProps(this.plugin, file).status;
		if (property === s.labelProp) return readProps(this.plugin, file).label;
		// (left out only by saying so: a note that says nothing is in the export)
		if (property === EXPORT_PROP) return !(this.raw(file, EXPORT_PROP) === false || this.raw(file, COMPILE_PROP) === false);
		return this.raw(file, property);
	}

	/** Does the note pass the filter? (The view adds the notes it keeps for other reasons.) */
	matches(file: TFile): boolean {
		return matches(this.def, (p) => this.valueOf(file, p), this.kindOf, this.env);
	}

	// ---- what the popover offers ----

	/** Everything the notes of the binder can be filtered by, with the values in use: Binders' own first, then the notes' other
	    properties by name, then what the files say. */
	fields(): Field[] {
		return this.catalogue ??= this.build();
	}
	field(id: string): Field | null { return this.fields().find((f) => f.id === id) ?? null; }

	private build(): Field[] {
		const s = this.plugin.settings, files = this.files(), env = this.env;
		const raw = new Map<string, unknown[]>();
		for (const f of files) {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined ?? {};
			for (const [k, v] of Object.entries(fm)) { let l = raw.get(k); if (!l) raw.set(k, l = []); l.push(v); }
		}
		const inUse = (id: string, kind: Kind): FieldValue[] => {
			if (kind !== 'text' && kind !== 'list') return [];
			const seen: { a: Atom; v: FieldValue }[] = [];
			for (const f of files) {
				const v = this.valueOf(f, id), once: Atom[] = [];
				for (const x of Array.isArray(v) ? v as unknown[] : [v]) {
					const a = atom(x, env);
					if (!a || once.some((o) => same(o, a))) continue;
					once.push(a);
					const link = typeof x === 'string' ? linkOf(x) : null;
					const hit = seen.find((e) => same(e.a, a));
					// (a link is kept as a link to the note, without what one scene happened to show it as)
					if (hit) { hit.v.count++; if (link && !hit.v.link) hit.v = { raw: `[[${link.target}]]`, shown: nameOf(link.target), count: hit.v.count, link: true }; }
					else if (typeof x === 'string' || typeof x === 'number') seen.push({ a, v: { raw: link ? `[[${link.target}]]` : String(x).trim(), shown: link ? nameOf(link.target) : String(x).trim(), count: 1, link: !!link } });
				}
			}
			return seen.map((e) => e.v);
		};
		const out: Field[] = [];
		const own: [string, string, Kind, string][] = [[s.statusProp, 'Status', 'text', 'circle-dot'], [s.labelProp, 'Label', 'text', 'palette'], [s.targetProp, 'Target', 'number', 'target'], [s.storyDateProp, 'Story date', 'date', 'calendar'], [EXPORT_PROP, 'Include in export', 'checkbox', 'book-up']];
		for (const [id, title, kind, icon] of own) {
			const values = inUse(id, kind);
			if (id === s.statusProp) values.sort((a, b) => rank(a.raw, s.statuses) - rank(b.raw, s.statuses));
			if (id === s.labelProp) values.sort((a, b) => rank(a.raw, s.labels.map((l) => l.name)) - rank(b.raw, s.labels.map((l) => l.name)));
			out.push({ id, title, kind, icon, own: true, values });
		}
		const skip = new Set([...own.map((o) => o[0]), s.storyOrderProp, ...HIDDEN]);
		for (const id of [...raw.keys()].filter((k) => !skip.has(k)).sort((a, b) => a.localeCompare(b))) {
			const kind = this.kindOf(id);
			out.push({ id, title: id, kind, icon: KIND_ICONS[kind], own: false, values: inUse(id, kind).sort((a, b) => b.count - a.count || a.shown.localeCompare(b.shown)) });
		}
		for (const f of FILE) out.push({ ...f, own: true, values: f.id === 'file.folder' ? inUse(f.id, 'text') : [] });
		return out;
	}
}

/** A seam for what comes next (export of a subset, a read-through of synopses): the notes of a folder that pass a filter, in
    manuscript order. `words` is what a note's `file.words` condition reads (none known: such a condition then fails). */
export function subsetOf(plugin: BindersPlugin, binder: Binder, folder: TFolder, filter: FilterDef, words: (f: TFile) => number | null = () => null): TFile[] {
	const s = new Subset(plugin, () => plugin.binders.scenes(binder.folder), words);
	s.def = filter;
	return plugin.binders.scenes(folder).filter((f) => s.matches(f));
}
