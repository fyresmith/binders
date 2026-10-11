import { Events, Notice, TFile, TFolder, normalizePath, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import { checkFormat, isBinderNote } from '../model';
import type BindersPlugin from '../main';
import { editProperties } from '../properties';
import { saveOpen } from '../scenes';
import { isScene } from '../snapshots';
import { append, parse, setDone, taskLines, type Task } from './tasks';
import { Walk } from './walk';

/* A binder's revision tasks: where its revision note is, what the note says now, which scene each task is about and
   where that scene comes in the manuscript. The note is the truth: it is read again whenever it changes (typed in,
   another device, another plugin ticking a box), and Binders writes two things to it and no others (tasks.ts; golden
   rule 3, the fourth exception).

   The note: the one the binder note names in `revision` (a link, so Obsidian keeps it right when the note is renamed
   or moved, and a writer can point it at a note they already keep). Until a first task is added there is none; then
   it is made as "Revision" in the binder's folder and named in the binder note. It is never a scene: not in the
   binder's order, its views, its counts, find and replace, the timeline, the record of the writing or an export
   (`BinderStore.items` leaves it out, asking `noteOf`).

   A Longform project has none: its index note is Longform's, and Binders writes nothing of its own there, so there
   is nowhere to say which note it is. (A project made a binder with "Convert to binder" has one like any binder.) */

export const PROP = 'revision';
const NAME = 'Revision';
export const LONGFORM = 'A Longform project keeps no revision tasks: its note is Longform’s, and there is nowhere in it to say which note they are in. “Convert to binder” makes it a binder that can.';

/** What adding a task wrote, for whoever has to take it back. */
export interface Added {
	note: TFile;
	/** The text appended to the note, exactly as written (a blank line first, if the note didn't end in a list). */
	added: string;
	/** The note was made for this task (and the binder note was given `revision`). */
	made: boolean;
}

/** What a task is about, placed in the book. */
export interface Place {
	/** `book`: no scene in particular. `item`: a scene or a folder of the binder. `outside`: a note that isn't in
	    it. `missing`: a link that names nothing. */
	kind: 'book' | 'item' | 'outside' | 'missing';
	key: string;
	name: string;
	item: TAbstractFile | null;
	/** Where it comes in the manuscript (the book first; what has no place there, last). */
	at: number;
}
export interface Group { place: Place; tasks: Task[] }
export interface Listing { note: TFile | null; groups: Group[]; open: number; done: number }

/** The note a `revision` property names, as a link path ("[[Revision]]", "[[Revision|My fixes]]", "Revision"). */
export function linkOf(named: unknown): string {
	if (typeof named !== 'string') return '';
	return named.trim().replace(/^!?\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
}

export class Revision extends Events {
	/** What each revision note said when last read, by its path. */
	private texts = new Map<string, string>();
	private reading = new Map<string, Promise<void>>();
	/** What each binder note named, and what that was, as last looked at: a note renamed with the link not yet (or
	    never) rewritten is still the binder's. */
	private seen = new Map<TFile, { raw: string; file: TFile | null }>();

	/** The walk through the unfinished tasks (walk.ts). */
	readonly walk: Walk;

	constructor(private plugin: BindersPlugin) {
		super();
		this.walk = new Walk(plugin, this);
		const { vault, metadataCache } = plugin.app;
		plugin.registerEvent(vault.on('modify', (f) => { if (f instanceof TFile && this.texts.has(f.path)) void this.load(f); }));
		plugin.registerEvent(vault.on('rename', (f, old) => {
			const text = this.texts.get(old);
			if (text !== undefined) { this.texts.delete(old); this.texts.set(f.path, text); }
			this.recheck();
		}));
		plugin.registerEvent(vault.on('delete', (f) => {
			// (remembered as one, for whoever hears of the delete after this: the record of the writing)
			if (f instanceof TFile) for (const v of this.seen.values()) if (v.file === f) this.lost.add(f);
			if (this.texts.delete(f.path)) this.trigger('changed');
			this.recheck();
		}));
		plugin.registerEvent(vault.on('create', () => { this.recheck(); }));
		// (the binder note may now name another note; a note it names may have just been indexed)
		plugin.registerEvent(metadataCache.on('changed', (f) => { if (plugin.binders.binderOf(f)?.note === f) this.recheck(); }));
		plugin.registerEvent(metadataCache.on('resolved', () => { this.recheck(); }));
		plugin.register(() => window.clearTimeout(this.soon));
	}

	// ---- the note ----

	/** The binder's revision note, if it has one: the note its binder note names, unless that is the binder note
	    itself or a folder's. Never in a Longform project. */
	noteOf(binder: Binder): TFile | null {
		if (binder.kind !== 'binder') return null;
		const { metadataCache, vault } = this.plugin.app, named = metadataCache.getFileCache(binder.note)?.frontmatter?.[PROP] as unknown;
		const path = linkOf(named), raw = typeof named === 'string' ? named : '';
		if (!path) { this.seen.delete(binder.note); return null; }
		const dest = metadataCache.getFirstLinkpathDest(path, binder.note.path), was = this.seen.get(binder.note);
		if (dest) {
			const ok = dest.extension === 'md' && dest !== binder.note && !this.plugin.binders.isHiddenNote(dest);
			this.seen.set(binder.note, { raw, file: ok ? dest : null });
			return ok ? dest : null;
		}
		// (the note renamed, its link not rewritten yet)
		if (was?.file && was.raw === raw && vault.getAbstractFileByPath(was.file.path) === was.file) return was.file;
		this.seen.set(binder.note, { raw, file: null });
		return null;
	}

	/** Paths of revision notes being made: they are the binder's revision notes before the binder note says so. */
	private making = new Set<string>();

	/** Revision notes deleted a moment ago. */
	private lost = new WeakSet<TFile>();

	/** Is this file a binder's revision note (or was, as it was renamed or deleted)? Then it is not a note of the
	    binder: the record of the writing, among others, leaves it out. */
	is(file: TFile): boolean {
		if (this.lost.has(file) || this.making.has(file.path)) return true;
		const binder = this.plugin.binders.binderOf(file);
		return !!binder && this.noteOf(binder) === file;
	}

	/** Which note each binder had when last looked at, so a change is noticed. */
	private had = new Map<TFile, TFile | null>();

	/** Looks at every binder's revision note again: the binder's items change if it is another (or none) now. */
	private recheck(): void {
		// (a folder of thousands of notes deleted is thousands of events: looked at once, after)
		if (this.soon) return;
		this.soon = window.setTimeout(() => { this.soon = 0; this.looked(); }, 50);
	}
	private soon = 0;

	private looked(): void {
		const store = this.plugin.binders;
		for (const b of store.all()) {
			if (b.kind !== 'binder') continue;
			const now = this.noteOf(b);
			if (this.had.has(b.note) ? this.had.get(b.note) === now : now === null) continue;
			this.had.set(b.note, now);
			store.revisionNoteMoved(b);
			this.trigger('changed');
		}
	}

	private load(note: TFile): Promise<void> {
		const going = this.reading.get(note.path);
		if (going !== undefined) return going.then(() => this.load(note));
		const p = this.plugin.app.vault.cachedRead(note).then((text) => {
			const was = this.texts.get(note.path);
			this.texts.set(note.path, text);
			if (was !== text) this.trigger('changed');
		}).catch(() => { /* gone meanwhile */ }).finally(() => { this.reading.delete(note.path); });
		this.reading.set(note.path, p);
		return p;
	}

	/** The revision note's text as the disk has it now (read once, and again whenever it changes). */
	async textOf(binder: Binder): Promise<string | null> {
		const note = this.noteOf(binder);
		if (!note) return null;
		if (!this.texts.has(note.path)) await this.load(note);
		return this.texts.get(note.path) ?? null;
	}

	// ---- reading ----

	/** Every item of the binder and where it comes in the manuscript. */
	order(binder: Binder): Map<string, number> {
		const store = this.plugin.binders, at = new Map<string, number>();
		let n = 0;
		const walk = (f: TFolder) => { for (const c of store.orderedChildren(f) ?? []) { at.set(c.path, n++); if (c instanceof TFolder) walk(c); } };
		walk(binder.folder);
		return at;
	}

	private placeOf(binder: Binder, note: TFile, path: string, lead: boolean, order: Map<string, number>): Place | null {
		const store = this.plugin.binders, dest = this.plugin.app.metadataCache.getFirstLinkpathDest(path, note.path);
		const name = path.split('/').pop() ?? path;
		if (!dest) return lead ? { kind: 'missing', key: `?${path}`, name, item: null, at: Infinity } : null;
		if (dest === binder.note) return { kind: 'book', key: '', name: binder.folder.name, item: binder.folder, at: -1 };
		if (store.binderOf(dest)?.note === binder.note) {
			// (a folder's own note stands for the folder)
			const item = store.isHiddenNote(dest) ? dest.parent : isScene(this.plugin, dest) ? dest : null;
			if (item && order.has(item.path)) return { kind: 'item', key: item.path, name: item instanceof TFile ? item.basename : item.name, item, at: order.get(item.path) ?? 0 };
		}
		return lead ? { kind: 'outside', key: `!${dest.path}`, name: dest.basename, item: dest, at: Infinity } : null;
	}

	/** The binder's tasks, under what each is about, in manuscript order. A task about two scenes is under both and
	    counted once. */
	list(binder: Binder | null): Listing {
		const note = binder ? this.noteOf(binder) : null;
		if (!binder || !note) return { note: null, groups: [], open: 0, done: 0 };
		const text = this.texts.get(note.path);
		if (text == null) { void this.load(note); return { note, groups: [], open: 0, done: 0 }; }
		const tasks = parse(text), order = this.order(binder), groups = new Map<string, Group>();
		const book: Place = { kind: 'book', key: '', name: binder.folder.name, item: binder.folder, at: -1 };
		for (const t of tasks) {
			let places = t.links.map((l) => this.placeOf(binder, note, l.path, l.lead, order)).filter((p): p is Place => !!p);
			// (a link that names something in the book wins over one that doesn't: the others are only words)
			if (places.some((p) => p.kind === 'item' || p.kind === 'book')) places = places.filter((p) => p.kind === 'item' || p.kind === 'book');
			if (!places.length) places = [book];
			for (const p of new Map(places.map((x) => [x.key, x])).values()) {
				let g = groups.get(p.key);
				if (!g) groups.set(p.key, (g = { place: p, tasks: [] }));
				g.tasks.push(t);
			}
		}
		const sorted = [...groups.values()].sort((a, b) => (a.place.at === b.place.at ? a.place.name.localeCompare(b.place.name) : a.place.at - b.place.at));
		return { note, groups: sorted, open: tasks.filter((t) => !t.done).length, done: tasks.filter((t) => t.done).length };
	}

	/** How many unfinished tasks are about this note or folder (a folder: about it or anything in it). The seam for
	    a filter's "has an unfinished task", an outliner column and a summary. */
	openFor(item: TAbstractFile): number {
		const binder = this.plugin.binders.binderOf(item);
		if (!binder) return 0;
		const seen = new Set<Task>(), under = item.path + '/';
		for (const g of this.list(binder).groups) if (g.place.kind === 'item' && (g.place.key === item.path || (item instanceof TFolder && g.place.key.startsWith(under)))) for (const t of g.tasks) if (!t.done) seen.add(t);
		return seen.size;
	}

	// ---- writing: one item added (golden rule 3, the fourth exception; the other write, a tick, comes with the pane) ----

	/** Adds a task at the end of the binder's revision note, making the note (and naming it in the binder note) if
	    this is the first. `about`: the scenes or folders it is about (a folder by its folder note); none, or the
	    binder's own folder, for the whole book. Throws, having written nothing, if the binder can't be changed. */
	async add(binder: Binder, about: TAbstractFile | TAbstractFile[] | null, text: string, passage = ''): Promise<Added> {
		const { app, binders: store } = this.plugin;
		if (!text.trim()) throw new Error('A task needs some words.');
		if (binder.kind !== 'binder') throw new Error(LONGFORM);
		if (binder.problem) throw new Error(`This binder can’t be changed. ${binder.problem}`);
		const targets: TFile[] = [];
		for (const a of about == null ? [] : Array.isArray(about) ? about : [about]) {
			if (a === binder.folder) continue;
			const f = a instanceof TFolder ? await store.ensureFolderNote(a) : a;
			if (f instanceof TFile && !targets.includes(f)) targets.push(f);
		}
		const existing = this.noteOf(binder);
		const lines = (source: string) => taskLines(targets.map((f) => app.fileManager.generateMarkdownLink(f, source)).join(', '), text, passage);
		if (existing) {
			// (typing in the note's own tab is on the disk before the task goes under it)
			await saveOpen(app, [existing]);
			const task = lines(existing.path);
			let added = '', blocked = false;
			const now = await app.vault.process(existing, (was) => {
				const next = append(was, task);
				if (next === null) { blocked = true; return was; }
				added = next.slice(was.length);
				return next;
			});
			if (blocked) throw new Error(`“${existing.basename}” ends inside a block of code, so a task added there would not be one. Nothing was written.`);
			this.texts.set(existing.path, now);
			this.trigger('changed');
			return { note: existing, added, made: false };
		}
		// the first task: the note is made with it in, then named in the binder note; if that can't be, the note goes
		let path = normalizePath(`${binder.folder.path}/${NAME}.md`);
		for (let n = 2; app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${binder.folder.path}/${NAME} ${n}.md`);
		const body = append('', lines(path)) ?? '';
		this.making.add(path);
		let made: TFile | null = null;
		try {
			made = await app.vault.create(path, body);
			const note = made;
			await editProperties(app, binder.note, (fm) => {
				if (!isBinderNote(fm)) throw new Error('This isn’t a binder’s note.');
				checkFormat(fm);
				fm[PROP] = `[[${app.metadataCache.fileToLinktext(note, binder.note.path, true)}]]`;
			});
			this.texts.set(note.path, body);
			// (the binder note's properties are read again a moment after they're written)
			for (let i = 0; i < 60 && this.noteOf(binder) !== note; i++) await new Promise((r) => window.setTimeout(r, 25));
		} catch (e) {
			if (made && (await app.vault.read(made).catch((): null => null)) === body) await app.fileManager.trashFile(made).catch((): void => undefined);
			throw e;
		} finally { this.making.delete(path); }
		this.trigger('changed');
		return { note: made, added: body, made: true };
	}

	/** Ticks (or clears) one task's box: the one character between its brackets, and nothing else (golden rule 3, the
	    fourth exception). What was typed in the note's own tab is saved first. Refused, and said, if the line is no
	    longer what was read. Returns the line as it is now, or null if nothing was written. */
	async tick(binder: Binder, task: Task, done: boolean): Promise<string | null> {
		const note = this.noteOf(binder);
		if (!note || binder.kind !== 'binder' || binder.problem) { this.tell(binder.problem ? `This binder can’t be changed. ${binder.problem}` : 'There is no revision note to tick a task in.'); return null; }
		await saveOpen(this.plugin.app, [note]);
		let line: string | null = null;
		const now = await this.plugin.app.vault.process(note, (was) => {
			const next = setDone(was, task, done);
			if (next === null) return was;
			const lines = was.split('\n'), at = lines[task.line] === task.raw ? task.line : lines.indexOf(task.raw);
			line = next.split('\n')[at] ?? null;
			return next;
		});
		this.texts.set(note.path, now);
		if (line === null) this.tell(`That task has changed in “${note.basename}”. Nothing was written.`);
		this.trigger('changed');
		return line;
	}

	/** Says something about the tasks: in the Revision pane's foot if the pane is in sight (a notice would cover its
	    buttons), else as a notice. */
	tell(text: string, ms = 5000): void {
		if (this.paneShown()) this.trigger('said', text);
		else new Notice(text, ms);
	}

	/** Is the Revision pane in sight? */
	paneShown(): boolean {
		return this.plugin.app.workspace.getLeavesOfType('binders-revision').some((l) => l.view.containerEl.isShown() && l.view.containerEl.offsetWidth > 0);
	}
}
