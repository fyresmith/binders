import { Platform, TFile, TFolder, editorInfoField, type TAbstractFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { SNAPSHOTS } from '../snapshot-text';
import { readProps } from '../view/props';
import { wordsIn } from '../view/words';
import { WordCounter } from '../view/word-counter';
import { frontOf, transactionWords } from './count';
import { recordDay } from './day';
import { KINDS, moveKind, type EventLine, type Kind } from './format';
import type { Device } from './ledger';
import { BinderRecord } from './record';
import { toHistory } from './merge';
import type { Merged } from './merge';
import type { History } from './model';
import { DEADLINE_PROP, readDeadline } from './plan';

/* The recorder: sees what a writer does to a binder and keeps it in the binder's record (record.ts; the format is
   docs/dev/file-format.md's). It writes only numbers and names, never a note's text, and nothing it does can stop or
   slow a keystroke: a key is a few additions to a map in memory, and the files are written every few minutes while
   there is something new, on leaving the binder, when the app goes to the background and when the plugin unloads.

   What it sees, and how:
     typing        one CodeMirror listener on every Markdown editor (a note's tab, the manuscript's sections, focus mode,
                   a phone's): a transaction that is a user's own input, deletion, move, undo or redo. Text that arrives
                   in an editor (a file changed on disk, a save from another editor of the same note) is no such
                   transaction, so it is counted once, where it was typed.
     notes         the vault's events, once the workspace is ready: a note or folder in a binder made, gone, renamed or
                   moved, or moved in or out of one. A note's words, if they are known, go with it as a block.
     properties    `BinderStore.editProps`, the one road Binders writes properties on: status, label and target.
     the rest      the order (the store's `move` and `reorder`), and the commands that do the rest, which tell it:
                   a snapshot, an export, an import, a bringing back, a split, a merge, a duplicate, Replace all.
   Binders' own acts (import, split, merge, duplicate, Replace all, bringing back) are events and never writing. */

/** How long after a first change the files are written, if nothing sends them sooner. */
export const WRITE_AFTER = 3 * 60_000;
/** A pause in the order changing, after which the next change is an event of its own. */
const ORDER_PAUSE = 2000;
/** What a binder's words are asked for again after, while some notes have not been counted yet. */
const STAMP_RETRY = 1500;
/** An act's events are still its own for this long after it ends (the vault's events come a moment after the writes). */
const ACT_LINGER = 3000;

const DEVICE_ID = 'binders-device-id', DEVICE_LABEL = 'binders-device-label';

export class Progress {
	private records = new Map<TFolder, BinderRecord>();
	private counter: WordCounter;
	/** What Binders is doing itself (an import, a split…), innermost last. */
	private acts: string[] = [];
	private timer = 0;
	private stampTimer = 0;
	private stampTries = 0;
	private needStamp = new Set<TFolder>();
	private lastBinder: TFolder | null = null;
	private lastOrder = new WeakMap<TFolder, number>();
	/** A folder renamed a moment ago, so the renames of everything in it are not events of their own. */
	private folderRenames: { from: string; to: string; at: number }[] = [];
	/** Which notes are counted, by the binder generation they were asked in. */
	private scenes = new WeakMap<TFile, { gen: number; binder: Binder | null }>();
	private gen = 0;
	private who: Device | null = null;
	private override: Device | null = null;
	private ready = false;
	/** For a test: how the files are written is made to fail. */
	failWrites = false;

	constructor(private plugin: BindersPlugin) {
		this.counter = new WordCounter(plugin, () => this.wake());
	}

	// ---- this device ----

	/** The label a device goes by until the writer names it: what it is. */
	defaultLabel(): string {
		if (Platform.isIosApp) return Platform.isTablet ? 'iPad' : 'iPhone';
		if (Platform.isAndroidApp) return Platform.isTablet ? 'Android tablet' : 'Android phone';
		return Platform.isMacOS ? 'Mac' : Platform.isWin ? 'Windows PC' : Platform.isLinux ? 'Linux PC' : 'Computer';
	}

	private kind(): Kind { return Platform.isPhone ? 'phone' : Platform.isTablet ? 'tablet' : 'desktop'; }

	/** This device: its id (kept in this vault's local storage on this device, not in the vault: a copy of the vault
	    on another device must not share it, so it is neither in the settings nor in a note), the name it goes by in
	    the files, and what kind it is. The local storage is Obsidian's own, kept with the app and not the plugin, so
	    it survives updating or reinstalling Binders and not clearing Obsidian's data or setting it up again: then
	    the device is a new one, with a file of its own, and the old file stays as a record of the old one. */
	device(): Device {
		if (this.override) return this.override;
		if (this.who) { this.who.kind = this.kind(); return this.who; }
		const app = this.plugin.app;
		let id: unknown = app.loadLocalStorage(DEVICE_ID), label: unknown = app.loadLocalStorage(DEVICE_LABEL);
		if (typeof id !== 'string' || !/^[0-9a-f]{6}$/.test(id)) {
			id = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
			app.saveLocalStorage(DEVICE_ID, id);
		}
		if (typeof label !== 'string' || !label.trim()) label = this.defaultLabel();
		this.who = { id: id as string, label: label as string, kind: this.kind() };
		return this.who;
	}

	/** For a test: this device as another (an id, a label, a kind), not kept. */
	setDevice(d: { id: string; label?: string; kind?: Kind } | null): void {
		for (const r of this.records.values()) r.dead = true;
		this.override = d ? { id: d.id, label: d.label ?? d.id, kind: d.kind && KINDS.includes(d.kind) ? d.kind : 'desktop' } : null;
		this.records.clear();
	}

	/** Forgets everything counted and not yet read again (for the tests: each starts from a vault with no record). */
	forget(): void {
		for (const r of this.records.values()) r.dead = true;
		this.records.clear(); this.kept.clear(); this.needStamp.clear(); this.waiting.length = 0; this.acts.length = 0; this.lastBinder = null;
		window.clearTimeout(this.timer); this.timer = 0;
	}

	/** The writer names this device: the files are written under the new name from now on. An empty name is the default. */
	setLabel(label: string): void {
		const name = label.trim().replace(/\s+/g, ' ');
		this.plugin.app.saveLocalStorage(DEVICE_LABEL, name || null);
		this.who = null;
		const d = this.device();
		for (const r of this.records.values()) for (const l of r.all()) { l.device = d; if (!l.locked) l.dirty = true; }
		for (const r of this.records.values()) if (r.dirty) this.schedule();
	}

	// ---- what is recorded ----

	/** Is a binder recorded: the switch is on and it is not one that can't be changed (a newer format). */
	recording(binder: Binder | null): boolean { return !!binder && this.plugin.settings.recordProgress && !binder.problem; }

	/** The record of a binder, or null where nothing is recorded (see `recording`; a Snapshots folder with notes of the
	    writer's own in it is not ours to fill). */
	recordOf(binder: Binder | null): BinderRecord | null {
		if (!binder || !this.recording(binder)) return null;
		let r = this.records.get(binder.folder);
		if (!r) { r = new BinderRecord(this.plugin.app, binder.folder, () => this.device()); this.records.set(binder.folder, r); this.begin(r); }
		// (looked at again every few seconds, not at every key)
		const now = performance.now();
		if (now - r.checked > 3000) {
			r.checked = now;
			const there = this.plugin.app.vault.getAbstractFileByPath(`${binder.folder.path}/${SNAPSHOTS}`);
			r.blocked = there && (!(there instanceof TFolder) || !this.plugin.binders.snapshotsFolder(binder)) ? `“${SNAPSHOTS}” in “${binder.folder.name}” is not a folder of snapshots` : null;
		}
		return r;
	}

	/** Reads the files of a binder not read yet, in the background. */
	private begin(r: BinderRecord): void { void r.load().then(() => { this.changed(); }, () => { window.setTimeout(() => { void r.load().catch(() => {}); }, 30_000); }); }

	private relOf(binder: Binder, path: string): string { return path.slice(binder.folder.path.length + 1).replace(/\.md$/i, ''); }

	/** The binder a note's typing is counted in, or null: a note of a binder (not its own, a folder's, or a snapshot). */
	private binderOf(file: TFile): Binder | null {
		const c = this.scenes.get(file);
		if (c && c.gen === this.gen) return c.binder;
		const store = this.plugin.binders, b = file.extension === 'md' ? store.binderOf(file) : null;
		const binder = b && file.path.startsWith(b.folder.path + '/') && !store.isHiddenNote(file) && !store.isRevisionNote(file) && !store.inSnapshots(file.path) ? b : null;
		this.scenes.set(file, { gen: this.gen, binder });
		return binder;
	}

	// ---- typing ----

	/** The editor extension: every Markdown editor reports what is typed in it. */
	extension(): Extension {
		return EditorView.updateListener.of((u) => {
			if (!u.docChanged || !this.plugin.settings.recordProgress || !this.ready) return;
			try {
				for (const tr of u.transactions) {
					if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move') || tr.isUserEvent('undo') || tr.isUserEvent('redo'))) continue;
					const file = u.state.field(editorInfoField, false)?.file;
					const binder = file ? this.binderOf(file) : null;
					if (!file || !binder) return;
					const changes: { fromA: number; toA: number; fromB: number; toB: number }[] = [];
					tr.changes.iterChanges((fromA, toA, fromB, toB) => { changes.push({ fromA, toA, fromB, toB }); });
					const c = transactionWords(tr.startState.doc, tr.newDoc, changes, frontOf(tr.startState.doc));
					this.typed(binder, file, c.added, c.cut, c.block);
				}
			} catch { /* a record that can't be kept never reaches the editor */ }
		});
	}

	/** Words typed in a note (or brought in or taken out a block at a time). */
	typed(binder: Binder, file: TFile, added: number, cut: number, block: number): void {
		const r = this.recordOf(binder);
		if (!r || r.blocked || (!added && !cut && !block)) return;
		const now = Date.now(), l = r.ledgerAt(recordDay(now)), rel = this.relOf(binder, file.path);
		l.typed(now, rel, added, cut);
		l.block(now, rel, block);
		this.touched(binder);
	}

	/** Words that came into a note or went out of it a block at a time by something Binders did (Replace all, bringing
	    back a snapshot): not writing, and no matter how many. */
	block(file: TFile, delta: number): void {
		const binder = this.binderOf(file), r = this.recordOf(binder);
		if (!binder || !r || r.blocked || !delta) return;
		const now = Date.now();
		r.ledgerAt(recordDay(now)).block(now, this.relOf(binder, file.path), delta);
		this.touched(binder);
	}

	/** An item's path in its binder, without ".md": how the record names it. */
	rel(item: TAbstractFile): string {
		const b = this.plugin.binders.binderOf(item);
		return b ? (item === b.folder ? '' : this.relOf(b, item.path)) : item.path;
	}

	/** The words a text has, the way the book is counted (as the totals are). */
	words(text: string): number { return wordsIn(this.plugin, text); }

	private touched(binder: Binder): void {
		this.lastBinder = binder.folder;
		this.needStamp.add(binder.folder);
		this.schedule();
	}

	// ---- events ----

	/** Something done to a binder, now. `item`: anything in it (a binder is found from it). Nothing for a binder that
	    isn't recorded. */
	event(item: TAbstractFile | string, e: Omit<EventLine, 't' | 'd' | 'at'> & { at?: number }): void {
		try {
			const at = e.at ?? Date.now(), binder = this.plugin.binders.binderOf(item);
			// (a binder just made isn't known to the store yet: the event waits for it)
			if (!binder) { if (typeof item !== 'string' && this.waiting.length < 50) this.waiting.push({ item, e: { ...e, at }, until: Date.now() + 30_000 }); return; }
			const r = this.recordOf(binder);
			if (!r || r.blocked) return;
			this.kept.delete(binder.folder);
			r.ledgerAt(recordDay(at)).event({ ...e, at, ...(this.acts.length && e.by === undefined && ['made', 'gone'].includes(e.k) ? { by: this.acts[this.acts.length - 1] } : {}) });
			this.touched(binder);
		} catch { /* a record that can't be kept never stops what is being done */ }
	}

	/** Events about a binder the store hasn't found yet. */
	private waiting: { item: TAbstractFile; e: Omit<EventLine, 't' | 'd' | 'at'> & { at: number }; until: number }[] = [];

	/** Runs something Binders does itself, which is an event and not writing; the events of the notes it makes and
	    takes away say what made them. */
	async during<T>(kind: string, work: () => Promise<T>): Promise<T> {
		this.acts.push(kind);
		try { return await work(); } finally {
			window.setTimeout(() => { const i = this.acts.lastIndexOf(kind); if (i >= 0) this.acts.splice(i, 1); }, ACT_LINGER);
		}
	}

	/** The properties that matter to the record, of a note's properties as they are. */
	pick(fm: Record<string, unknown>): Record<string, string> {
		const s = this.plugin.settings, text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
		return { status: text(fm[s.statusProp]), label: text(fm[s.labelProp]), target: text(fm[s.targetProp]), deadline: readDeadline(fm[DEADLINE_PROP]) ?? '' };
	}

	/** A note's status, label or target was changed (through `editProps`). */
	propsChanged(file: TFile, before: Record<string, string> | undefined, after: Record<string, string> | undefined): void {
		if (!before || !after) return;
		const binder = this.plugin.binders.binderOf(file);
		if (!binder) return;
		const store = this.plugin.binders, hidden = store.isHiddenNote(file);
		// (a folder's are in its folder note: the event is about the folder)
		const p = hidden ? (file === binder.note ? '' : this.relOf(binder, file.parent?.path ?? '')) : this.relOf(binder, file.path);
		for (const k of ['status', 'label', 'target', 'deadline'] as const) if (before[k] !== after[k]) this.event(file, { k, p, from: before[k], to: after[k], ...(k === 'deadline' && Number(after.target) > 0 ? { n: Number(after.target) } : {}), ...(hidden ? { folder: 1 as const } : {}) });
		this.planSeen.set(file.path, `${after.target}|${after.deadline}`);
	}

	/** What a folder note's target and deadline were when last looked at, by path: a change made in the note's own
	    properties (not through Binders) is an event too, found by comparing. */
	private planSeen = new Map<string, string>();
	/** Properties just written through Binders: the watcher is not to tell them a second time. */
	expect(file: TFile, p: Record<string, string>): void { this.planSeen.set(file.path, `${p.target}|${p.deadline}`); }
	private seeded = new WeakSet<TFolder>();

	private seedPlans(): void {
		const store = this.plugin.binders, vault = this.plugin.app.vault;
		for (const b of store.all()) {
			if (this.seeded.has(b.folder)) continue;
			this.seeded.add(b.folder);
			for (const f of vault.getMarkdownFiles()) if (f.path.startsWith(b.folder.path + '/') && store.isHiddenNote(f)) { const p = this.pickOf(f); if (p) this.planSeen.set(f.path, `${p.target}|${p.deadline}`); }
		}
	}

	private pickOf(file: TFile): Record<string, string> | null {
		const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		return fm ? this.pick(fm) : null;
	}

	/** A note's properties changed in Obsidian: a target or a deadline that moved is told, as if it had been set here. */
	private planWatch(file: TFile): void {
		const store = this.plugin.binders;
		if (!this.ready || !store.isHiddenNote(file) || !store.binderOf(file)) return;
		this.seedPlans();
		const now = this.pickOf(file) ?? { target: '', deadline: '' }, key = `${now.target}|${now.deadline}`, was = this.planSeen.get(file.path);
		this.planSeen.set(file.path, key);
		if (was === undefined || was === key) return;
		const [target = '', deadline = ''] = was.split('|');
		this.propsChanged(file, { status: '', label: '', target, deadline }, { status: '', label: '', target: now.target, deadline: now.deadline });
	}

	/** The order of a folder's items changed (a drag, a move, a sort): one event for a run of them. */
	ordered(folder: TFolder): void {
		const binder = this.plugin.binders.binderOf(folder);
		if (!binder) return;
		const now = Date.now(), last = this.lastOrder.get(binder.folder) ?? 0;
		this.lastOrder.set(binder.folder, now);
		if (now - last < ORDER_PAUSE) return;
		this.event(folder, { k: 'order', p: folder === binder.folder ? '' : this.relOf(binder, folder.path) });
	}

	// ---- the vault's events: notes made, gone, renamed, moved ----

	private inside(binder: Binder, path: string): boolean { return path.startsWith(binder.folder.path + '/') && !(path === `${binder.folder.path}/${SNAPSHOTS}` || path.startsWith(`${binder.folder.path}/${SNAPSHOTS}/`)); }

	private made(f: TAbstractFile): void {
		const store = this.plugin.binders, binder = store.binderOf(f);
		if (!binder || f === binder.folder || !this.inside(binder, f.path) || (f instanceof TFile && (f.extension !== 'md' || store.isHiddenNote(f) || store.isRevisionNote(f)))) return;
		if (f instanceof TFolder && store.isHiddenNote(f)) return;
		const act = this.acts[this.acts.length - 1];
		if (f instanceof TFolder) { this.event(f, { k: 'made', p: this.relOf(binder, f.path), folder: 1 }); return; }
		if (!(f instanceof TFile)) return;
		void this.plugin.app.vault.cachedRead(f).then((text) => {
			const w = this.words(text);
			this.event(f, { k: 'made', p: this.relOf(binder, f.path), ...(w ? { w } : {}) });
			// what Binders brings in whole is words that came a block at a time; a split or a merge only moves them
			if (w && (act === 'import' || act === 'duplicate' || act === 'back')) this.block(f, w);
		}, () => { this.event(f, { k: 'made', p: this.relOf(binder, f.path) }); });
	}

	private gone(f: TAbstractFile): void {
		const store = this.plugin.binders, binder = store.binderOf(f.path);
		if (!binder || f === binder.folder || !this.inside(binder, f.path)) return;
		if (f instanceof TFile && (f.extension !== 'md' || store.isHiddenNote(f) || store.isRevisionNote(f))) return;
		if (f instanceof TFolder) { this.event(f, { k: 'gone', p: this.relOf(binder, f.path), folder: 1 }); return; }
		if (!(f instanceof TFile)) return;
		const act = this.acts[this.acts.length - 1], w = this.counter.get(f) ?? 0, p = this.relOf(binder, f.path);
		this.event(f, { k: 'gone', p, ...(w ? { w } : {}) });
		if (w && act !== 'merge' && act !== 'split') this.block(f, -w);
	}

	private renamed(f: TAbstractFile, old: string): void {
		const now = Date.now();
		this.folderRenames = this.folderRenames.filter((x) => now - x.at < 200);
		// the renames of what is in a folder that was renamed are the folder's
		if (this.folderRenames.some((x) => old.startsWith(x.from + '/') && f.path === x.to + old.slice(x.from.length))) return;
		const store = this.plugin.binders, isFolder = f instanceof TFolder;
		if (isFolder) this.folderRenames.push({ from: old, to: f.path, at: now });
		for (const b of store.all()) {
			const bp = b.folder.path;
			// a binder renamed, or one in a folder that was: nothing inside it moved
			if (f === b.folder || (isFolder && bp.startsWith(f.path + '/'))) continue;
			const nowIn = this.inside(b, f.path), wasIn = this.inside(b, old);
			if (!nowIn && !wasIn) continue;
			if (f instanceof TFile && (f.extension !== 'md' || store.isHiddenNote(f) || store.isRevisionNote(f))) continue;
			if (nowIn && wasIn) {
				const from = this.relOf(b, old), to = this.relOf(b, f.path);
				this.event(f, { k: moveKind(from, to), from, to, ...(isFolder ? { folder: 1 as const } : {}) });
			} else if (nowIn) {
				const w = f instanceof TFile ? this.counter.get(f) ?? 0 : 0;
				this.event(f, { k: 'in', p: this.relOf(b, f.path), ...(w ? { w } : {}), ...(isFolder ? { folder: 1 as const } : {}) });
				if (w && f instanceof TFile) this.block(f, w);
			} else {
				const w = f instanceof TFile ? this.counter.get(f) ?? 0 : 0, p = this.relOf(b, old);
				const r = this.recordOf(b);
				if (!r || r.blocked) continue;
				r.ledgerAt(recordDay(now)).event({ at: now, k: 'out', p, ...(w ? { w } : {}), ...(isFolder ? { folder: 1 as const } : {}) });
				if (w) r.ledgerAt(recordDay(now)).block(now, p, -w);
				this.touched(b);
			}
		}
	}

	// ---- today, and the whole record ----

	/** The words written today in a binder by typing, on all its devices (added less cut), never less than none. */
	today(folder: TFolder): number {
		const binder = this.plugin.binders.binderOf(folder), r = binder ? this.records.get(binder.folder) ?? this.recordOf(binder) : null;
		if (!binder || !r) return 0;
		return Math.max(0, r.todayNet(recordDay(Date.now())));
	}

	/** The binder's record as the window reads it. */
	async read(folder: TFolder): Promise<Merged | null> {
		const binder = this.plugin.binders.binderOf(folder), r = this.recordOf(binder);
		return r ? r.readAll() : null;
	}

	async history(folder: TFolder): Promise<History | null> {
		const m = await this.read(folder);
		return m ? toHistory(m, this.plugin.binders.statusesOf(folder)) : null;
	}

	/** The record as a history, kept for a few seconds for what asks often (the toolbar's plan): dropped when
	    anything is recorded or another device's file arrives. */
	private kept = new Map<TFolder, { at: number; h: History | null }>();
	async keptHistory(folder: TFolder): Promise<History | null> {
		const had = this.kept.get(folder);
		if (had && Date.now() - had.at < 20_000) return had.h;
		const h = await this.history(folder);
		this.kept.set(folder, { at: Date.now(), h });
		return h;
	}

	// ---- writing ----

	private wake(): void {
		if (!this.needStamp.size || this.stampTimer) return;
		this.stampTimer = window.setTimeout(() => { this.stampTimer = 0; void this.flush(); }, STAMP_RETRY);
	}

	/** Run when a binder's record has been read, or another device's file has arrived: what shows the record draws again. */
	readonly listeners = new Set<() => void>();
	private changed(): void { this.kept.clear(); for (const f of this.listeners) { try { f(); } catch { /* one listener's trouble is its own */ } } }

	private schedule(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => { this.timer = 0; void this.flush(); }, WRITE_AFTER);
	}

	/** The binder's words as they stand, stamped on the day. False if some notes have not been counted yet (they are
	    being read: asked again in a moment). */
	private stamp(binder: Binder, r: BinderRecord): boolean {
		const store = this.plugin.binders, files = store.scenes(binder.folder), st: Record<string, number> = {};
		let w = 0, known = true;
		for (const f of files) {
			const n = this.counter.get(f);
			if (n === null) { known = false; continue; }
			w += n;
			const status = readProps(this.plugin, f).status;
			st[status] = (st[status] ?? 0) + n;
		}
		if (!known) return false;
		const now = Date.now();
		r.ledgerAt(recordDay(now)).stamp(now, { w, n: files.length, st });
		return true;
	}

	/** Writes what is new in every binder's record, the day's totals first. Never throws, and never waits on a file that
	    can't be written: that is tried again. `final`: the app is going, so the totals are taken as they are known. */
	async flush(final = false): Promise<void> {
		if (this.timer) { window.clearTimeout(this.timer); this.timer = 0; }
		try {
			for (const [folder, r] of [...this.records]) {
				const binder = this.plugin.binders.all().find((b) => b.folder === folder) ?? null;
				if (!binder || !this.recording(binder)) continue;
				if (this.needStamp.has(folder) && !r.blocked) {
					if (this.stamp(binder, r)) { this.needStamp.delete(folder); this.stampTries = 0; } else if (!final && ++this.stampTries < 20) this.wake();
				}
				if (this.failWrites) { this.schedule(); continue; }
				if (!r.dirty) continue;
				if (!(await r.flush())) this.retry(r);
			}
		} catch { /* tried again at the next write */ }
	}

	private retry(r: BinderRecord): void {
		if (this.timer) return;
		const wait = Math.min(WRITE_AFTER * 2 ** Math.min(r.failures, 4), 30 * 60_000);
		this.timer = window.setTimeout(() => { this.timer = 0; void this.flush(); }, wait);
	}

	/** The other devices' files again, where they changed, for the numbers that add them in. */
	private async others(): Promise<void> {
		let any = false;
		for (const r of this.records.values()) if (await r.refresh()) any = true;
		if (any) this.changed();
	}

	// ---- starting ----

	start(): void {
		const plugin = this.plugin, app = plugin.app, ws = app.workspace, vault = app.vault;
		const bump = () => { this.gen++; };
		plugin.registerEvent(plugin.binders.on('changed', () => {
			const now = Date.now(), list = this.waiting.splice(0).filter((w) => w.until > now);
			for (const w of list) { if (plugin.binders.binderOf(w.item)) this.event(w.item, w.e); else this.waiting.push(w); }
		}));
		plugin.registerEvent(plugin.binders.on('changed', bump));
		plugin.registerEvent(app.metadataCache.on('changed', (f) => { if (f instanceof TFile) this.planWatch(f); }));
		plugin.registerEvent(plugin.binders.on('changed', () => { if (this.ready) this.seedPlans(); }));
		ws.onLayoutReady(() => {
			// (Obsidian makes an event for every file it finds as it starts: those are not things done)
			this.ready = true;
			plugin.registerEvent(vault.on('create', (f) => { bump(); this.made(f); }));
			plugin.registerEvent(vault.on('delete', (f) => { bump(); this.gone(f); }));
			plugin.registerEvent(vault.on('rename', (f, old) => { bump(); this.renamed(f, old); }));
			plugin.registerEvent(vault.on('modify', (f) => { if (f.path.includes(`/${SNAPSHOTS}/`) && f.path.endsWith('.binder-history')) void this.others(); }));
			plugin.registerEvent(vault.on('create', (f) => { if (f.path.includes(`/${SNAPSHOTS}/`) && f.path.endsWith('.binder-history')) void this.others(); }));
		});
		// leaving the binder: a note of another (or none) in front
		plugin.registerEvent(ws.on('file-open', (file) => {
			const b = file ? plugin.binders.binderOf(file) : null;
			if (this.lastBinder && b?.folder !== this.lastBinder) { this.lastBinder = null; void this.flush(); }
		}));
		// a phone puts the app away, a window is closed, Obsidian quits
		plugin.registerDomEvent(document, 'visibilitychange', () => { if (document.hidden) void this.flush(true); });
		plugin.registerDomEvent(window, 'pagehide', () => { void this.flush(true); });
		// (Obsidian holds the quit for every promise it is given: only when something is waiting)
		plugin.registerEvent(ws.on('quit', (tasks) => { if (this.needStamp.size || [...this.records.values()].some((r) => r.dirty)) tasks.addPromise(this.flush(true)); }));
		plugin.register(() => { window.clearTimeout(this.timer); window.clearTimeout(this.stampTimer); void this.flush(true); });
	}
}
