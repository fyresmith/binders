import { ButtonComponent, Component, MarkdownRenderer, Menu, Modal, Platform, Setting, TFile, TFolder, parseYaml, setIcon } from 'obsidian';
import type BindersPlugin from '../main';
import { forRender, parts } from '../scene-text';
import { changes, planBack, type Changes, type Plan, type Row, type Scope, type Since } from '../binder-snapshot-text';
import { backOptions, bringBackFolder, deleteFolderSnapshot, folderSnapshots, forgetInterrupted, forgetRead, hasSnapshots, interrupted, interruptedIn, isNewer, makeFromSnapshot, nameFolderSnapshot, readFolderSnapshot, remakeNote, sizeOfSnapshot, stateNow, takeFolderSnapshot, type FolderSnapshot, type Interrupted, type Read, type State } from '../binder-snapshots';
import { badSnapshotName } from '../snapshot-text';
import { bringBackText, isScene } from '../snapshots';
import { commitAll } from './edit';
import { historyLook, submenu, trashPhrase, updatesLinks } from './internals';
import { ask, buttonRow, cancelButton, confirm } from './modals';
import { iconButton, proseChanges, say, when, whenIn, whenShort } from './snapshots';
import { wordsIn, wordsLabel } from './words';

/* Snapshots of a folder or of a whole binder, to the writer. The dialog is the note's Snapshots dialog grown to hold
   a book: the same list at the side, under "now"; beside it, where a note's snapshot shows its text, a folder's shows
   its contents in their order, and "Show changes" marks what is different in them now. A note in the contents opens
   as a note's snapshot does, with the same comparison. Nothing here writes a file itself: it asks
   `src/binder-snapshots.ts` (and, for one note's text, `src/snapshots.ts`). */

const tell = (e: unknown) => { say(e instanceof Error ? e.message.replace(/^E[A-Z]+: /, '') : typeof e === 'string' ? e : 'That didn’t work.'); };
const count = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const sizeOf = (s: { notes: number; words: number }) => `${count(s.notes, 'note')} · ${wordsLabel(s.words)}`;
const dirOf = (path: string): string => { const p = path.replace(/\/$/, ''), i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
const nameOf = (path: string): string => path.replace(/\/$/, '').slice(dirOf(path).length).replace(/\.md$/i, '');
/** What a snapshot is called where it has no name: when it was taken. */
const called = (s: FolderSnapshot) => s.title || when(s.taken);
const quoted = (s: FolderSnapshot) => (s.title ? `“${s.title}”` : `the snapshot from ${whenIn(s.taken)}`);

/** A synopsis, a title or a cell being typed in, in any window: saved, as the views save them, so that it is in
    whatever is read next. */
async function commitFields(plugin: BindersPlugin): Promise<void> {
	const docs = new Set<Document>([activeDocument]);
	plugin.app.workspace.iterateAllLeaves((l) => { docs.add(l.view.containerEl.doc); });
	for (const d of docs) await commitAll(d.body, true);
}

/** "Take a snapshot" of a folder: no questions. Says what it did, and how big the folder is. */
export async function takeFolder(plugin: BindersPlugin, folder: TFolder, title = ''): Promise<void> {
	try {
		await commitFields(plugin);
		const r = await takeFolderSnapshot(plugin, folder, title);
		if (r.made) say(`Took a snapshot of “${folder.name}”${title ? `, named “${title}”` : ''}: ${sizeOf(r.state)}.`);
		else if (title && r.snapshot.title === title) say(`Nothing in “${folder.name}” has changed since its last snapshot, ${whenIn(r.snapshot.taken)}. That one is now named “${title}”.`, 6000);
		else say(`Nothing in “${folder.name}” has changed since its last snapshot, ${whenIn(r.snapshot.taken)}.`);
	} catch (e) { tell(e); }
}

/** What is different, in a sentence's worth: "3 notes rewritten, 1 new, 2 moved". */
function summary(c: Changes): string {
	const out: string[] = [];
	if (c.rewritten) out.push(`${count(c.rewritten, 'note')} rewritten`);
	if (c.fresh) out.push(`${c.fresh.toLocaleString()} new`);
	if (c.gone) out.push(`${c.gone.toLocaleString()} gone`);
	if (c.moved) out.push(`${c.moved.toLocaleString()} moved`);
	if (c.renamed) out.push(`${c.renamed.toLocaleString()} renamed`);
	if (c.props) out.push(`${c.props.toLocaleString()} with other properties`);
	return out.join(', ');
}

/** What is different about one item, for the end of its row. */
function said(r: Row): string {
	if (r.gone) return 'gone';
	if (r.fresh) return 'new';
	const out: string[] = [];
	if (r.rewritten) out.push(r.added || r.removed ? [r.added ? `+${r.added.toLocaleString()}` : '', r.removed ? `−${r.removed.toLocaleString()}` : ''].filter((x) => x).join(' ') + (r.added + r.removed === 1 ? ' word' : ' words') : 'rewritten');
	if (r.renamed) out.push(`now “${r.renamed}”`);
	if (r.into != null) out.push(r.into ? `moved to “${nameOf(r.into)}”` : 'moved out of its folder');
	else if (r.reordered) out.push('moved');
	if (r.props.length) out.push(r.props.length > 3 ? `${r.props.slice(0, 3).join(', ')} and ${r.props.length - 3} more` : r.props.join(', '));
	return out.join(' · ');
}
const differs = (r: Row): boolean => r.gone || r.fresh || r.rewritten || !!r.renamed || r.into != null || r.reordered || r.props.length > 0;

type Page = 'contents' | 'read' | Row;

export class FolderSnapshotsModal extends Modal {
	private side: HTMLElement;
	private listEl: HTMLElement;
	private pane: HTMLElement;
	private nameEl: HTMLElement;
	private detailEl: HTMLElement;
	private actions: HTMLElement;
	private bodyEl: HTMLElement;
	private emptyEl: HTMLElement;
	private emptyRow: HTMLElement;
	private back: HTMLElement | null = null;
	private namedEl: HTMLElement;
	private list: FolderSnapshot[] = [];
	/** The snapshot shown (null: the folder as it is now; undefined: none, a phone's list). */
	private shown: FolderSnapshot | null | undefined = undefined;
	/** What it is compared with: another snapshot, or (null) the folder as it is now. */
	private against: FolderSnapshot | null = null;
	private full: boolean | null = null;
	private changesOn = true;
	private namedOnly = false;
	private page: Page = 'contents';
	private now: Promise<State> | null = null;
	private rendered = new Component();
	private drawn = new Component();
	private turn = 0;
	private seen: IntersectionObserver | null = null;
	private readonly isBinder: boolean;
	private readonly readOnly: boolean;
	private readonly why: string;

	constructor(private plugin: BindersPlugin, private folder: TFolder, private opening: TFile | null = null) {
		super(plugin.app);
		const b = plugin.binders.binderOf(folder);
		this.isBinder = b?.folder === folder;
		this.readOnly = !!b?.problem;
		this.why = `This binder can’t be changed. ${b?.problem ?? ''}`;
	}

	private heading(): string { return `Snapshots of “${this.folder.name}”`; }
	private nowName(): string { return this.isBinder ? 'The binder now' : 'The folder now'; }
	private takeOne = (): void => { void takeFolder(this.plugin, this.folder); };
	/** The list being drawn, and whether something has changed since that began. */
	private loading: Promise<void> | null = null;
	private stale = false;
	private closed = false;
	private timer = 0;
	private state(): Promise<State> { return this.now ??= stateNow(this.plugin, this.folder); }

	onOpen(): void {
		const { modalEl } = this;
		this.setTitle(this.heading());
		modalEl.addClass('binders-snapshots', 'binders-folder-snapshots');
		this.side = createDiv({ cls: 'modal-sidebar mod-history binders-snapshots-side' });
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		const can = !this.readOnly;
		if (!Platform.isPhone) {
			const head = inner.createDiv({ cls: 'binders-snapshots-head' });
			head.createDiv({ cls: 'binders-snapshots-of', text: this.folder.name });
			this.namedEl = iconButton(head, 'filter', 'Only snapshots with a name', () => { this.namedOnly = !this.namedOnly; void this.refresh(); });
			if (can) iconButton(head, 'camera', 'Take a snapshot', this.takeOne);
		} else {
			const head = inner.createDiv({ cls: 'binders-snapshots-head' });
			if (can) new ButtonComponent(head).setButtonText('Take a snapshot').onClick(this.takeOne);
			this.namedEl = iconButton(head, 'filter', 'Only snapshots with a name', () => { this.namedOnly = !this.namedOnly; void this.refresh(); });
		}
		this.namedEl.addClass('binders-folder-snapshots-named');
		this.listEl = inner.createDiv({ cls: 'modal-sidebar-list binders-snapshots-list', attr: { role: 'listbox', 'aria-label': this.heading() } });
		if (this.readOnly) inner.createDiv({ cls: 'binders-snapshots-note', text: this.why });
		this.pane = createDiv({ cls: 'sync-history-content-container binders-snapshots-pane' });
		const content = this.pane.createDiv({ cls: 'sync-history-content' });
		const bar = content.createDiv({ cls: 'modal-setting-titlebar binders-snapshots-bar' });
		const title = bar.createDiv({ cls: 'modal-setting-title binders-snapshots-title' });
		this.nameEl = title.createSpan({ cls: 'binders-snapshots-name' });
		this.detailEl = title.createSpan({ cls: 'binders-snapshots-detail' });
		this.actions = bar.createDiv({ cls: 'modal-setting-titlebar-actions' });
		this.bodyEl = content.createDiv({ cls: 'sync-history-preview binders-snapshots-text binders-folder-snapshots-body' });
		this.emptyEl = createDiv({ cls: 'binders-snapshots-empty' });
		this.emptyRow = createDiv({ cls: 'modal-button-container' });
		if (Platform.isPhone) {
			this.back = createDiv({ cls: 'clickable-icon modal-setting-back-button mod-raised', attr: { 'aria-label': 'Back to the list', role: 'button' } });
			setIcon(this.back, 'arrow-left');
			this.back.addEventListener('click', () => this.toList());
		}
		this.rendered.load();
		this.drawn.load();
		// the list follows the vault while the dialog is open; "now" is read again after anything in the folder changes
		const { vault } = this.app, store = this.plugin.binders;
		const seen = (path: string) => { if (store.inSnapshots(path)) this.soon(); else if (path.startsWith(this.folder.path + '/')) this.now = null; };
		this.rendered.registerEvent(vault.on('create', (f) => seen(f.path)));
		this.rendered.registerEvent(vault.on('delete', (f) => seen(f.path)));
		this.rendered.registerEvent(vault.on('modify', (f) => { if (!store.inSnapshots(f.path) && f.path.startsWith(this.folder.path + '/')) this.now = null; }));
		this.rendered.registerEvent(vault.on('rename', (f, old) => { seen(f.path); seen(old); }));
		void this.refresh(true);
	}

	/** The vault changed under "Snapshots": the list is drawn again in a moment, once for all that changes meanwhile.
	    Files that arrive in a burst (sync) cost a few drawings, not one each (nothing is read for a drawing, so each
	    is over before the next file comes: only waiting puts them together). */
	private soon(): void {
		if (this.timer || this.closed) return;
		this.timer = window.setTimeout(() => { this.timer = 0; if (!this.closed) void this.refresh(); }, 50);
	}

	/** Draws the list again: one drawing at a time, and one more after it when anything changed meanwhile, as the
	    note's dialog does (`SnapshotsModal.refresh`), so the last always starts after the last change. */
	private refresh(first = false): Promise<void> {
		if (this.loading !== null) { this.stale = true; return this.loading; }
		const run = async (): Promise<void> => {
			this.stale = false;
			await this.load(first);
			while (this.stale && !this.closed) { this.stale = false; await this.load(); }
		};
		const loading = this.loading = run().finally(() => { if (this.loading === loading) this.loading = null; });
		return loading;
	}

	onClose(): void { this.closed = true; window.clearTimeout(this.timer); this.seen?.disconnect(); this.rendered.unload(); this.drawn.unload(); this.contentEl.empty(); forgetRead(); }

	private layout(full: boolean): void {
		const { contentEl, modalEl } = this;
		if (this.full === full) return;
		this.full = full;
		for (const el of [this.side, this.pane, this.emptyEl, this.emptyRow]) el.detach();
		this.back?.detach();
		this.setTitle(this.heading());
		modalEl.toggleClass('mod-sync-history', full);
		modalEl.toggleClass('mod-sidebar-layout', full);
		modalEl.removeClass('is-plain');
		this.containerEl.toggleClass('mod-confirmation', !full);
		if (!full) { contentEl.appendChild(this.emptyEl); modalEl.appendChild(this.emptyRow); return; }
		contentEl.appendChild(this.side);
		if (!Platform.isPhone) contentEl.appendChild(this.pane);
		modalEl.toggleClass('is-plain', !historyLook(contentEl));
	}

	private toList(): void {
		this.pane.detach();
		this.back?.detach();
		this.setTitle(this.heading());
		this.contentEl.appendChild(this.side);
		this.shown = undefined;
		const was = this.listEl.querySelector<HTMLElement>('.is-active');
		was?.removeClass('is-active');
		was?.setAttr('aria-selected', 'false');
	}

	private none(): void {
		const el = this.emptyEl, row = this.emptyRow;
		el.empty();
		row.empty();
		el.createEl('p', { text: `A snapshot keeps everything in ${this.isBinder ? 'this binder' : 'this folder'} as it is now: every note’s text and properties, and the order they are in. Take one before a big change, or when a draft goes out: later you can read it, see what has changed since, and bring it back.` });
		if (this.readOnly) el.createEl('p', { cls: 'u-muted', text: this.why });
		if (!this.readOnly) { new ButtonComponent(row).setButtonText('Take a snapshot').setCta().onClick(this.takeOne); cancelButton(row, this); }
		else cancelButton(row, this).setButtonText('Close');
	}

	private async load(first = false): Promise<void> {
		const all = folderSnapshots(this.plugin, this.folder);
		this.list = all;
		const active = this.modalEl.doc.activeElement, focused = [this.listEl, this.actions, this.emptyRow].some((el) => el.contains(active));
		const was = all.length ? this.shown : undefined;
		if (!all.length) { this.shown = undefined; this.none(); }
		this.layout(all.length > 0);
		this.listEl.empty();
		const focus = focused || (first && !Platform.isPhone);
		if (!all.length) { if (focus) this.emptyRow.querySelector('button')?.focus(); return; }
		const items: HTMLElement[] = [];
		const row = (s: FolderSnapshot | null, name: string, detail: string, saidAs: string) => {
			const el = this.listEl.createDiv({ cls: 'modal-sidebar-list-item file-recovery-list-item-header tappable binders-snapshots-item', attr: { tabindex: '-1', role: 'option', 'aria-selected': 'false', 'aria-label': saidAs } });
			const d = el.createDiv({ cls: 'modal-sidebar-list-item-details' });
			d.createDiv({ cls: 'binders-snapshots-item-name', text: name });
			const det = d.createDiv({ cls: 'binders-snapshots-item-detail u-muted', text: detail });
			const pick = (): void => { this.page = 'contents'; void this.show(s, el); };
			el.addEventListener('click', pick);
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); return; }
				const i = items.indexOf(el), to = e.key === 'ArrowDown' ? items[i + 1] : e.key === 'ArrowUp' ? items[i - 1] : e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : null;
				if (to === null) return;
				e.preventDefault();
				if (to && to !== el) { to.focus(); to.click(); }
			});
			if (s) el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(s).showAtMouseEvent(e); });
			items.push(el);
			return { el, det };
		};
		const rows = new Map<FolderSnapshot | null, HTMLElement>();
		const top = row(null, this.nowName(), ' ', this.nowName());
		top.el.addClass('is-now');
		rows.set(null, top.el);
		void this.state().then((st) => { top.det.setText(sizeOf(st)); top.el.setAttr('aria-label', `${this.nowName()}, ${sizeOf(st)}`); }, () => { /* said when it's shown */ });
		// with many, the ones with names can be had alone, and the months are said
		const many = all.length > 12, named = all.filter((s) => s.title && !s.auto);
		const mixed = many && named.length > 0 && named.length < all.length;
		if (!mixed) this.namedOnly = false;
		this.namedEl.toggle(mixed);
		this.namedEl.toggleClass('is-active', this.namedOnly);
		this.namedEl.setAttr('aria-pressed', String(this.namedOnly));
		// a row says how big the binder was once its file has been looked at, which is when it comes into sight
		this.seen?.disconnect();
		const sizes = new Map<Element, () => void>();
		const seen = this.seen = new IntersectionObserver((got) => { for (const x of got) if (x.isIntersecting) { sizes.get(x.target)?.(); sizes.delete(x.target); seen.unobserve(x.target); } }, { root: this.listEl });
		const list = this.namedOnly ? named : all;
		let month = '';
		for (const s of list) {
			if (many) { const m = window.moment(s.taken).format('MMMM YYYY'); if (m !== month) { month = m; this.listEl.createDiv({ cls: 'binders-folder-snapshots-month', text: m }); } }
			const at = whenShort(s.taken), part = s.of !== this.ofPath() ? (s.of ? `In “${nameOf(s.of)}”` : 'In the whole binder') : '';
			const detail = [s.title ? at : '', part].filter((x) => x).join(' · ');
			const r = row(s, s.title || at, detail || ' ', `Snapshot${s.title ? ` “${s.title}”` : ''}, ${whenIn(s.taken)}${part ? ', ' + part.toLowerCase() : ''}${s.auto ? ', taken by Binders' : ''}`);
			// (one Binders took itself is quieter than one the writer took)
			r.el.toggleClass('is-auto', s.auto);
			rows.set(s, r.el);
			// (one with a name says when; the rest of the line, or all of it, is how much there was)
			sizes.set(r.el, () => { void sizeOfSnapshot(this.plugin, s).then((size) => { if (size && r.det.isConnected) r.det.setText([detail, wordsLabel(size.words)].filter((x) => x).join(' · ')); }); });
			seen.observe(r.el);
		}
		const again = was ? all.find((s) => s.file === was.file) ?? null : was;
		const asked = this.opening ? all.find((x) => x.file === this.opening) : undefined;
		this.opening = null;
		const pick = asked ?? (again !== undefined ? again : !Platform.isPhone ? list[0] ?? null : undefined);
		if (asked) await this.show(asked, rows.get(asked) ?? null);
		else if (pick !== undefined && !(Platform.isPhone && !this.pane.parentElement)) await this.show(pick, rows.get(pick) ?? null);
		else if (Platform.isPhone && this.pane.parentElement && (!was || !all.some((s) => s.file === was.file))) this.toList();
		const stop = this.listEl.querySelector<HTMLElement>('.binders-snapshots-item.is-active') ?? items[0];
		stop?.setAttr('tabindex', '0');
		if (focus) stop?.focus();
	}

	private ofPath(): string { const b = this.plugin.binders.binderOf(this.folder); return b && b.folder !== this.folder ? this.folder.path.slice(b.folder.path.length + 1) : ''; }

	/** A quiet switch in the bar, as a toolbar's is in Obsidian: it changes what's shown, nothing else. */
	private quiet(icon: string, label: string, on: boolean, flip: () => void, off = ''): HTMLElement {
		const el = this.actions.createDiv({ cls: 'text-icon-button binders-snapshots-compare', attr: { role: 'button', tabindex: off ? '-1' : '0', 'aria-pressed': String(on && !off), 'aria-disabled': String(!!off) } });
		setIcon(el.createSpan({ cls: 'text-button-icon' }), icon);
		el.createSpan({ cls: 'text-button-label', text: label });
		el.toggleClass('is-active', on && !off);
		el.toggleClass('is-disabled', !!off);
		if (off) el.setAttr('aria-label', off);
		const go = () => { if (!off) flip(); };
		el.addEventListener('click', go);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
		return el;
	}

	/** Shows a snapshot (or the folder as it is now) beside the list. */
	private async show(s: FolderSnapshot | null, row: HTMLElement | null): Promise<void> {
		const turn = ++this.turn;
		if (this.shown !== s) this.against = null;
		this.shown = s;
		for (const el of Array.from(this.listEl.querySelectorAll('.binders-snapshots-item'))) { el.removeClass('is-active'); el.setAttr('aria-selected', 'false'); if (row) el.setAttr('tabindex', '-1'); }
		row?.addClass('is-active');
		row?.setAttr('aria-selected', 'true');
		row?.setAttr('tabindex', '0');
		if (Platform.isPhone && !this.pane.parentElement) { this.side.detach(); this.contentEl.appendChild(this.pane); }
		const name = s ? called(s) : this.nowName();
		this.nameEl.setText(name);
		this.detailEl.setText(s?.title ? when(s.taken) : '');
		if (this.back) { this.setTitle(name); this.titleEl.appendChild(this.back); }
		this.actions.empty();
		this.bodyEl.empty();
		this.bodyEl.createDiv({ cls: 'u-muted binders-folder-snapshots-wait', text: 'Reading…' });
		let then: State & { damaged?: string[] }, now: State, c: Changes | null = null;
		try {
			now = s ? (this.against ? await readFolderSnapshot(this.plugin, this.against, this.folder) : await this.state()) : await this.state();
			then = s ? await readFolderSnapshot(this.plugin, s, this.folder) : now;
			if (s) c = changes(then.entries, now.entries, { yaml: parseYaml });
		} catch (e) {
			if (turn !== this.turn) return;
			this.bodyEl.empty();
			this.bodyEl.createDiv({ cls: 'u-muted binders-folder-snapshots-wait', text: isNewer(e) ? (e as Error).message : `This snapshot can’t be read. ${e instanceof Error ? e.message : ''}` });
			// (one a newer Binders made is left as it is: not named, not deleted, from here)
			if (s && !isNewer(e)) this.more(s, true);
			return;
		}
		if (turn !== this.turn) return;
		this.detailEl.setText([s?.title ? when(s.taken) : '', sizeOf(then), c?.same ? (this.against ? 'The same' : 'Same as now') : ''].filter((x) => x).join(' · '));
		this.bar(s, then, now, c);
		this.draw(s, then, now, c);
	}

	/** What can be done with what's shown: for a snapshot, what's shown of it (its changes; its text, to read), then
	    the one thing the dialog is for, then the rest in a menu. */
	private bar(s: FolderSnapshot | null, then: State, now: State, c: Changes | null): void {
		const el = this.actions, page = this.page, again = () => { this.bar(s, then, now, c); this.draw(s, then, now, c); };
		el.empty();
		if (!s) {
			this.quiet('book-open', 'Read', page === 'read', () => { this.page = page === 'read' ? 'contents' : 'read'; again(); });
			if (!this.readOnly) new ButtonComponent(el).setButtonText('Take a snapshot').setCta().onClick(this.takeOne);
			return;
		}
		const row = typeof page === 'object' ? page : null;
		const same = row ? !row.rewritten : !!c?.same;
		this.quiet('diff', 'Show changes', this.changesOn, () => { this.changesOn = !this.changesOn; again(); }, same ? (row ? 'This note’s text is the same' : 'Nothing is different') : '');
		if (!row && !Platform.isMobile) this.quiet('book-open', 'Read', page === 'read', () => { this.page = page === 'read' ? 'contents' : 'read'; again(); });
		if (!this.readOnly && !this.against) {
			if (row) {
				const bad = !!(then as Read).damaged?.length, can = !bad && row.kind === 'note' && (row.gone || row.rewritten);
				new ButtonComponent(el).setButtonText('Bring back').setCta().setDisabled(!can).setTooltip(bad ? 'This snapshot’s file isn’t as it was written' : !can ? 'The note already has this text' : row.gone ? 'Make this note again, with the text and properties it had' : 'Put this text in the note. A snapshot of the text there now is taken first.').onClick(() => void this.restoreNote(s, row, then));
			} else {
				// the whole of it: what will change is said first, on a screen of its own
				const bad = !!(then as Read).damaged?.length, off = bad || !!c?.same;
				new ButtonComponent(el).setButtonText('Bring back...').setCta().setDisabled(off).setTooltip(bad ? 'This snapshot’s file isn’t as it was written' : c?.same ? 'Nothing is different' : 'Choose what to bring back, and see what will change. A snapshot of everything as it is now is taken first.').onClick(() => void this.bringBack(s));
			}
		}
		this.more(s);
	}

	private more(s: FolderSnapshot, unread = false): void {
		const more = iconButton(this.actions, 'more-horizontal', 'More', () => {
			const r = more.getBoundingClientRect();
			this.menu(s, unread).showAtPosition({ x: r.right, y: r.bottom + 4, left: true }, more.doc);
		});
	}

	private draw(s: FolderSnapshot | null, then: State, now: State, c: Changes | null): void {
		const el = this.bodyEl, page = this.page;
		this.drawn.unload();
		this.drawn = new Component();
		this.drawn.load();
		el.empty();
		el.scrollTop = 0;
		el.toggleClass('markdown-rendered', page !== 'contents');
		el.toggleClass('binders-snapshots-diff', page !== 'contents');
		const marked = !!s && !!c && this.changesOn && !c.same;
		if (typeof page === 'object') { this.note(el, s, page, then, now, c); return; }
		if (s && c && marked) {
			const key = el.createDiv({ cls: 'binders-snapshots-key binders-folder-snapshots-key' });
			key.appendText(`${this.against ? `From this snapshot to ${quoted(this.against)}` : 'Since this snapshot'}: ${summary(c)}. `);
			if (c.rewritten && (c.added || c.removed)) key.appendText(`${[c.added ? `${count(c.added, 'word')} put in` : '', c.removed ? `${c.removed.toLocaleString()} taken out` : ''].filter((x) => x).join(', ')}. `);
		}
		const bad = (then as Read).damaged ?? [];
		if (s && bad.length) el.createDiv({ cls: 'binders-snapshots-key binders-folder-snapshots-key binders-folder-snapshots-damaged', text: `This snapshot’s file isn’t as it was written${bad.filter((x) => x).length ? `: ${count(bad.filter((x) => x).length, 'note')} in it ${bad.filter((x) => x).length === 1 ? 'doesn’t' : 'don’t'} match (${bad.filter((x) => x).slice(0, 3).map((x) => `“${nameOf(x)}”`).join(', ')}${bad.filter((x) => x).length > 3 ? '…' : ''})` : ' (part of it is missing)'}. It can be read, and nothing is brought back from it.` });
		if (page === 'read') this.read(el, then, c && marked ? c : null);
		else this.contents(el, then, c, marked);
	}

	// ---- the contents: the folder as it stood, in its order ----

	private contents(el: HTMLElement, then: State, c: Changes | null, marked: boolean): void {
		// (unmarked, the contents as they stood: no row for a folder's own properties, which is there only to say they changed)
		const rows = c ? (marked ? c.rows : c.rows.filter((r) => r.then && !r.then.role)) : changes(then.entries, then.entries, { words: false }).rows;
		const tree = el.createDiv({ cls: 'binders-folder-snapshots-tree', attr: { role: 'tree', 'aria-label': 'Contents' } });
		const words = new Map<Row, { notes: number; words: number }>();
		// (a folder's size is what's in it: added up from the end, each row into the folder rows above it)
		const open: Row[] = [];
		for (const r of rows) {
			while (open.length > r.depth) open.pop();
			if (r.kind === 'folder') { words.set(r, { notes: 0, words: 0 }); open[r.depth] = r; open.length = r.depth + 1; }
			else if (r.kind === 'note' && r.then && !r.then.role) { const w = wordsIn(this.plugin, r.then.text ?? ''); words.set(r, { notes: 1, words: w }); for (const f of open) { const t = words.get(f); if (t) { t.notes++; t.words += w; } } }
		}
		const parents: HTMLElement[] = [tree];
		const same = (r: Row) => !differs(r) && !r.inside;
		let i = 0;
		const one = (r: Row, into: HTMLElement): HTMLElement => {
			const item = into.createDiv({ cls: 'tree-item binders-folder-snapshots-row' });
			const self = item.createDiv({ cls: 'tree-item-self is-clickable', attr: { tabindex: '0', role: 'treeitem' } });
			const size = words.get(r), diff = marked && differs(r) ? said(r) : '';
			if (r.kind === 'folder') {
				self.addClass('mod-collapsible');
				setIcon(self.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'right-triangle');
				self.setAttr('aria-expanded', 'true');
			}
			const inner = self.createDiv({ cls: 'tree-item-inner' });
			const name = r.then?.role ? (r.then.role === 'binder note' ? 'The binder’s own properties' : 'The folder’s own properties') : r.name;
			if (marked && r.gone) inner.createEl('del', { text: name }); else if (marked && r.fresh) inner.createEl('ins', { text: name }); else inner.setText(name);
			const flair = diff || (r.kind === 'folder' ? (size ? count(size.notes, 'note') : '') : r.kind === 'file' ? 'not a note' : size ? size.words.toLocaleString() : '');
			if (flair) self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: flair });
			self.toggleClass('is-different', !!diff);
			self.toggleClass('is-same', marked && !diff && !r.inside);
			self.setAttr('aria-label', `${name}${r.kind === 'folder' ? ', folder' : ''}${diff ? ', ' + diff : marked ? ', the same' : ''}`);
			if (r.kind === 'folder') {
				const kids = item.createDiv({ cls: 'tree-item-children' });
				const icon = self.querySelector('.collapse-icon');
				const shut = (on: boolean) => { item.toggleClass('is-collapsed', on); icon?.toggleClass('is-collapsed', on); kids.toggle(!on); self.setAttr('aria-expanded', String(!on)); };
				// (a folder in which nothing is different, among ones that have changed, is shut)
				if (marked && !diff && !r.inside) shut(true);
				const fold = () => shut(!item.hasClass('is-collapsed'));
				self.addEventListener('click', fold);
				self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fold(); } });
				return kids;
			}
			if (r.kind === 'note' && !r.then?.role && (r.then?.text != null || r.now?.text != null)) {
				const go = () => { this.page = r; void this.reshow(); };
				self.addEventListener('click', go);
				self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
			} else self.removeClass('is-clickable');
			return item;
		};
		// rows are flat with a depth: a folder's rows are the ones that follow it, one deeper
		const level = (depth: number, into: HTMLElement): void => {
			let run: Row[] = [];
			const flush = () => {
				// a stretch of items that are all the same folds into one line, to open
				if (marked && run.length > 1) {
					const notes = run.every((r) => r.kind !== 'folder'), folders = run.every((r) => r.kind === 'folder');
					const text = `${count(run.length, notes ? 'note' : folders ? 'folder' : 'item')} the same`, held = run;
					const bar = into.createDiv({ cls: 'diff-collapsed binders-snapshots-folded binders-folder-snapshots-folded', text, attr: { role: 'button', tabindex: '0' } });
					const unfold = () => { const frag = createDiv(); for (const r of held) this.subtree(r, rows, frag, one); while (frag.firstChild) into.insertBefore(frag.firstChild, bar); bar.detach(); };
					bar.addEventListener('click', unfold);
					bar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unfold(); } });
				} else for (const r of run) this.subtree(r, rows, into, one);
				run = [];
			};
			while (i < rows.length && rows[i].depth >= depth) {
				const r = rows[i];
				if (marked && same(r)) { run.push(r); i++; while (i < rows.length && rows[i].depth > depth) i++; continue; }
				flush();
				i++;
				const kids = one(r, into);
				if (r.kind === 'folder') level(depth + 1, kids);
			}
			flush();
		};
		void parents;
		level(0, tree);
		// the arrow keys go up and down the rows in sight
		tree.addEventListener('keydown', (e) => {
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
			const all = Array.from(tree.querySelectorAll<HTMLElement>('.tree-item-self, .binders-folder-snapshots-folded')).filter((x) => x.offsetParent), at = all.indexOf(tree.doc.activeElement as HTMLElement);
			const to = all[at + (e.key === 'ArrowDown' ? 1 : -1)];
			if (to) { e.preventDefault(); to.focus(); }
		});
	}

	/** One row and everything under it, drawn plainly (what a folded stretch opens to). */
	private subtree(r: Row, rows: Row[], into: HTMLElement, one: (r: Row, into: HTMLElement) => HTMLElement): void {
		const at = rows.indexOf(r), stack: HTMLElement[] = [into];
		const kids = one(r, into);
		if (r.kind !== 'folder') return;
		stack[r.depth + 1] = kids;
		for (let k = at + 1; k < rows.length && rows[k].depth > r.depth; k++) {
			const el = one(rows[k], stack[rows[k].depth] ?? kids);
			if (rows[k].kind === 'folder') stack[rows[k].depth + 1] = el;
		}
	}

	private async reshow(): Promise<void> {
		const s = this.shown;
		if (s === undefined) return;
		await this.show(s, this.listEl.querySelector<HTMLElement>('.is-active'));
	}

	// ---- one note of it ----

	private note(el: HTMLElement, s: FolderSnapshot | null, r: Row, _then: State, _now: State, _c: Changes | null): void {
		const crumb = el.createDiv({ cls: 'binders-folder-snapshots-crumb' });
		const backTo = () => { this.page = 'contents'; void this.reshow(); };
		iconButton(crumb, 'arrow-left', 'Back to the contents', backTo);
		const e = (r.then ?? r.now), where = dirOf(e.path).split('/').filter((x) => x);
		crumb.createSpan({ cls: 'binders-folder-snapshots-crumb-path', text: [...where, ''].join(' / ') });
		crumb.createSpan({ cls: 'binders-folder-snapshots-crumb-name', text: r.name });
		const diff = said(r);
		if (s && differs(r)) crumb.createSpan({ cls: 'binders-folder-snapshots-crumb-said', text: diff });
		const before = parts(r.then?.text ?? '').body, after = parts(r.now?.text ?? '').body;
		const text = r.then ? before : after;
		if (s && r.rewritten && this.changesOn) { proseChanges(el, before, after, this.against ? 'To the other snapshot: ' : 'Since this snapshot: '); return; }
		const page = el.createDiv({ cls: 'binders-folder-snapshots-page' });
		if (!text.trim()) page.createDiv({ cls: 'u-muted', text: 'A blank page.' });
		else void MarkdownRenderer.render(this.app, forRender(this.plugin.paragraphs.forRender(text, this.folder.path + '/' + e.path)), page, this.folder.path + '/' + e.path, this.drawn);
	}

	// ---- the whole of it, to read: the manuscript as it stood ----

	private read(el: HTMLElement, then: State, c: Changes | null): void {
		const rows = c ? c.rows : changes(then.entries, then.entries, { words: false }).rows;
		const view = el.createDiv({ cls: 'binders-folder-snapshots-read' });
		// a note's text is drawn when it comes near the window: a book is long
		const waiting = new Map<Element, () => void>();
		const near = new IntersectionObserver((seen) => { for (const x of seen) if (x.isIntersecting) { waiting.get(x.target)?.(); waiting.delete(x.target); near.unobserve(x.target); } }, { root: el, rootMargin: '1200px 0px' });
		this.drawn.register(() => near.disconnect());
		let run = 0, runEl: HTMLElement | null = null;
		for (const r of rows) {
			if (r.then?.role || r.kind === 'file') continue;
			const same = !!c && !differs(r) && (r.kind !== 'folder' || !r.inside);
			if (c && same) {
				// (what is the same is passed over in a line; a folder that is the same takes its notes with it)
				if (r.kind === 'note') { run++; runEl ??= view.createDiv({ cls: 'binders-snapshots-folded binders-folder-snapshots-folded' }); runEl.setText(`${count(run, 'note')} the same`); }
				continue;
			}
			run = 0; runEl = null;
			const head = view.createEl(r.kind === 'folder' ? (r.depth ? 'h2' : 'h1') : 'h3', { cls: r.kind === 'folder' ? 'binders-folder-snapshots-read-folder' : 'binders-folder-snapshots-read-note' });
			if (c && r.gone) head.createEl('del', { text: r.name }); else if (c && r.fresh) head.createEl('ins', { text: r.name }); else head.setText(r.name);
			if (c && differs(r)) head.createSpan({ cls: 'binders-folder-snapshots-read-said', text: said(r) });
			if (r.kind !== 'note') continue;
			const before = parts(r.then?.text ?? '').body, after = parts(r.now?.text ?? '').body, text = r.then ? before : after;
			const body = view.createDiv({ cls: 'binders-folder-snapshots-read-text' });
			// (about the room it will take, so the page doesn't jump as it fills)
			body.setCssProps({ '--binders-folder-snapshots-room': `${Math.max(1, Math.round(text.length / 90))}lh` });
			const path = this.folder.path + '/' + ((r.then ?? r.now)).path;
			waiting.set(body, () => {
				body.setCssProps({ '--binders-folder-snapshots-room': '0px' });
				if (c && r.rewritten) proseChanges(body, before, after, null);
				else if (text.trim()) void MarkdownRenderer.render(this.app, forRender(this.plugin.paragraphs.forRender(text, path)), body, path, this.drawn);
			});
			near.observe(body);
		}
	}

	// ---- what's done with one ----

	private menu(s: FolderSnapshot, unread = false): Menu {
		const m = new Menu();
		if (!unread && Platform.isMobile && typeof this.page !== 'object') m.addItem((i) => i.setTitle(this.page === 'read' ? 'Show the contents' : 'Read').setIcon(this.page === 'read' ? 'list' : 'book-open').onClick(() => { this.page = this.page === 'read' ? 'contents' : 'read'; void this.reshow(); }));
		// compared with now, or with another snapshot
		if (!unread && this.list.length > 1) m.addItem((i) => {
			i.setTitle('Compare with').setIcon('diff');
			submenu(i, (sub) => {
				sub.addItem((x) => x.setTitle(this.nowName()).setChecked(!this.against).onClick(() => { this.against = null; this.changesOn = true; void this.reshow(); }));
				for (const o of this.list.filter((x) => x !== s).slice(0, 24)) sub.addItem((x) => x.setTitle(o.title ? `${o.title} (${whenShort(o.taken)})` : whenShort(o.taken)).setChecked(this.against === o).onClick(() => { this.against = o; this.changesOn = true; this.page = 'contents'; void this.reshow(); }));
			}, m);
		});
		if (!this.readOnly) m.addItem((i) => i.setTitle('Name this snapshot...').setIcon('pencil-line').onClick(async () => {
			const name = await ask(this.app, { title: 'Name this snapshot', placeholder: 'Draft sent to Sam, before the new ending…', cta: 'Save', value: s.title, allowEmpty: true, check: (x) => (x ? badSnapshotName(x) : null) });
			if (name == null) return;
			try { await nameFolderSnapshot(this.app, s, name); } catch (e) { tell(e); }
		}));
		if (!this.readOnly && !unread) m.addItem((i) => i.setTitle(this.isBinder ? 'Make a binder from this snapshot' : 'Make a folder from this snapshot').setIcon('copy-plus').onClick(async () => {
			// (said as it goes: a long book is some hundreds of notes to write)
			const going = say(`Making ${this.isBinder ? 'a binder' : 'a folder'} from ${quoted(s)}…`, 0);
			try {
				const made = await makeFromSnapshot(this.plugin, s, this.folder, s.title || window.moment(s.taken).format('YYYY-MM-DD HH.mm'), (done, of) => { if (done % 10 === 0 || done === of) going.setMessage(`Making ${this.isBinder ? 'a binder' : 'a folder'} from ${quoted(s)}: ${done.toLocaleString()} of ${count(of, 'note')}…`); });
				going.hide();
				say(`Made “${made.name}”: ${this.isBinder ? 'the binder' : 'the folder'} as it stood ${whenIn(s.taken)}, beside the one that’s there.`, 8000);
			} catch (e) { going.hide(); tell(e); }
		}));
		if (!this.readOnly) {
			m.addSeparator();
			m.addItem((i) => i.setTitle('Delete snapshot').setIcon('trash-2').setWarning(true).onClick(async () => {
				const ok = await confirm(this.app, { title: 'Delete snapshot', text: `Delete ${quoted(s)} of “${this.folder.name}”? It ${trashPhrase(this.app, false)}.`, cta: 'Delete', warning: true });
				if (!ok) return;
				try { await deleteFolderSnapshot(this.app, s); } catch (e) { tell(e); }
			}));
		}
		return m;
	}

	/** "Bring back...": the screen that says what bringing this snapshot back will change, counted from the snapshot
	    and from the folder as it is this moment (not as it was when the dialog drew it). */
	private async bringBack(s: FolderSnapshot): Promise<void> {
		try {
			const after = () => { this.now = null; this.page = 'contents'; void this.refresh(); };
			// (one that was cut short comes first: this binder is part of the way to another snapshot)
			const cut = await interruptedIn(this.plugin, this.folder);
			if (cut) { new InterruptedModal(this.plugin, cut, after).open(); return; }
			await commitFields(this.plugin);
			const now = await stateNow(this.plugin, this.folder), then = await readFolderSnapshot(this.plugin, s, this.folder);
			if (then.damaged.length) throw new Error('This snapshot’s file isn’t as it was written, so nothing is brought back from it.');
			this.now = Promise.resolve(now);
			new BringBackModal(this.plugin, this.folder, s, then, now, after).open();
		} catch (e) { tell(e); }
	}

	/** One note of a snapshot brought back: its text into the note that's there (a snapshot of that text is taken
	    first, as a note's own "Bring back" does), or the note made again if it's gone. */
	private async restoreNote(s: FolderSnapshot, r: Row, state: State): Promise<void> {
		const { app } = this, then = r.then;
		if (!then || then.text == null) return;
		try {
			if (r.gone) {
				const made = await remakeNote(this.plugin, this.folder, state.entries, then);
				say(`“${r.name}” is back, as it stood ${whenIn(s.taken)}${made.basename !== r.name ? `, as “${made.basename}”: a note named “${r.name}” is there now` : ''}.`, 6000);
			} else {
				const f = r.now ? app.vault.getAbstractFileByPath(`${this.folder.path}/${r.now.path}`) : null;
				if (!(f instanceof TFile) || !isScene(this.plugin, f)) throw new Error('That note isn’t there any more.');
				const { kept } = await bringBackText(this.plugin, f, parts(then.text).body, `Before bringing back ${s.title || 'a snapshot'}`);
				say(`Brought back the text of “${f.basename}” from ${quoted(s)}.${kept ? ' The text it replaced is kept as a snapshot of the note.' : ''}`, 6000);
			}
			this.now = null;
			this.page = 'contents';
			await this.reshow();
		} catch (e) { tell(e); }
	}
}

// ---- bringing a whole one back: what will change, said before it does ----

const SCOPES: Record<Scope, string> = { all: 'Everything', both: 'The text and the order', text: 'The text of the notes', order: 'The order' };
const isScope = (v: string): v is Scope => Object.prototype.hasOwnProperty.call(SCOPES, v);
const SINCE: Record<Since, string> = { stay: 'Leave it where it is', gather: 'Move it to one folder' };

/** "Bring back..." a snapshot of a folder or of the binder: what comes back (everything, the notes' text, the order,
    or those two), what that will change, and what is different that it leaves alone, all counted before anything is
    done. Its button does what the screen says and nothing else (`bringBackFolder`). `preset`: what it opens on (a
    bringing back that was interrupted, taken up again). */
class BringBackModal extends Modal {
	private what: Scope = 'all';
	private since: Since = 'stay';
	private plan: Plan;
	private readonly c: Changes;
	private introEl: HTMLElement;
	private planEl: HTMLElement;
	private sinceSetting: Setting;
	private go: ButtonComponent;
	private busy = false;

	constructor(private plugin: BindersPlugin, private folder: TFolder, private s: FolderSnapshot, private then: State, private now: State, private done: () => void, preset?: { scope?: Scope; since?: Since }) {
		super(plugin.app);
		if (preset?.scope) this.what = preset.scope;
		if (preset?.since) this.since = preset.since;
		this.c = changes(then.entries, now.entries, { yaml: parseYaml });
		this.plan = this.work();
	}

	private work(): Plan { return planBack(this.c, this.then.entries, this.now.entries, this.what, backOptions(this.plugin, this.s, this.folder, this.since)); }

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(`Bring back ${quoted(this.s)}`);
		this.modalEl.addClass('binders-folder-snapshots-back');
		this.introEl = contentEl.createEl('p');
		new Setting(contentEl).setName('Bring back').addDropdown((d) => d.addOptions(SCOPES).setValue(this.what).onChange((v) => { if (isScope(v)) { this.what = v; this.draw(); } }));
		this.planEl = contentEl.createDiv({ cls: 'binders-folder-snapshots-plan' });
		// (only there when everything comes back and something is new since: see `draw`)
		this.sinceSetting = new Setting(contentEl).setName('What is new since').addDropdown((d) => d.addOptions(SINCE).setValue(this.since).onChange((v) => { this.since = v === 'gather' ? 'gather' : 'stay'; this.draw(); }));
		this.sinceSetting.settingEl.addClass('binders-folder-snapshots-since');
		const row = buttonRow(this);
		this.go = new ButtonComponent(row).setButtonText('Bring back').setCta().onClick(() => void this.run());
		cancelButton(row, this);
		this.draw();
	}

	onClose(): void { this.contentEl.empty(); }

	private draw(): void {
		const p = this.plan = this.work(), el = this.planEl, s = this.s, L = p.left, A = p.all;
		const what = this.what === 'both' ? 'the text and the order' : this.what === 'text' ? 'the text' : 'the order', from = s.title ? `the snapshot from ${whenIn(s.taken)}` : 'this snapshot';
		this.introEl.setText(this.what === 'all'
			? `“${this.folder.name}” goes back to ${from}: its notes as they were, with their properties, what is gone made again, and what was renamed or moved put back. Nothing is deleted. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back.`
			: `“${this.folder.name}” gets back ${what} it had in ${from}. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back.`);
		el.empty();
		// (an item is called what it is called now: that is the one the writer will look for)
		const some = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${(list.length - 3).toLocaleString()} more` : list.join(', '));
		const names = (list: Row[]) => some(list.map((r) => `“${r.renamed ?? r.name}”`));
		const line = (ul: HTMLElement, text: string, detail = '') => { const li = ul.createEl('li'); li.createSpan({ text }); if (detail) li.createSpan({ cls: 'u-muted', text: ' ' + detail }); };
		const it = (list: unknown[], one: string, many: string) => (list.length === 1 ? one : many);
		const will = el.createEl('ul', { cls: 'binders-folder-snapshots-plan-will' });
		if (p.rewritten.length && this.what !== 'order') {
			const words = [p.back ? `${count(p.back, 'word comes', 'words come')} back` : '', p.away ? `${p.away.toLocaleString()} written since ${p.away === 1 ? 'goes' : 'go'}` : ''].filter((x) => x).join(', ');
			line(will, `${count(p.rewritten.length, 'note gets', 'notes get')} the text ${it(p.rewritten, 'it', 'they')} had:`, `${names(p.rewritten)}.${words ? ` ${words.charAt(0).toUpperCase()}${words.slice(1)} (kept in the snapshot taken first).` : ''}`);
		}
		if (A) {
			if (A.made.length) line(will, `${count(A.made.length, 'item that is gone is', 'items that are gone are')} made again:`, `${names(A.made)}.`);
			if (A.moved.length) line(will, `${count(A.moved.length, 'item goes', 'items go')} back to the folder ${it(A.moved, 'it was', 'they were')} in:`, `${names(A.moved)}.`);
		}
		if (p.orders.length) line(will, `${count(p.moved.length, 'item goes', 'items go')} back to where ${it(p.moved, 'it was', 'they were')} in the order:`, `${names(p.moved)}.`);
		if (A) {
			if (A.renamed.length) line(will, `${count(A.renamed.length, 'item gets', 'items get')} ${it(A.renamed, 'its', 'their')} old ${it(A.renamed, 'name', 'names')} back:`, `${some(A.renamed.map((r) => `“${r.renamed ?? ''}” becomes “${r.name}”`))}.`);
			if (A.props.length) { const all = [...new Set(A.props.flatMap((r) => r.props))]; line(will, `${count(A.props.length, 'item gets', 'items get')} the properties ${it(A.props, 'it', 'they')} had:`, `${all.slice(0, 6).join(', ')}${all.length > 6 ? ` and ${all.length - 6} more` : ''}.`); }
			if (A.gather) line(will, `${count(A.gathered.length, 'item that is new since goes', 'items that are new since go')} into ${A.gather.make ? 'a new folder' : 'the folder'}, “${A.gather.folder.replace(/\/$/, '')}”:`, `${names(A.gathered)}. Nothing is deleted.`);
		}
		if (p.nothing) line(will, this.what === 'all' ? 'Nothing: everything in this snapshot is there as it was.' : this.what === 'both' ? 'Nothing: the notes that are there have the text they had, in the order they had.' : this.what === 'text' ? 'Nothing: the notes that are there have the text they had.' : 'Nothing: the items that are there are in the order they had.');
		// what is different and is not brought back, said plainly
		const left = createEl('ul', { cls: 'binders-folder-snapshots-plan-left' });
		if (L.text.length) line(left, `${count(L.text.length, 'note keeps', 'notes keep')} the text ${it(L.text, 'it has', 'they have')} now:`, `${names(L.text)}.`);
		if (L.order.length) line(left, `${count(L.order.length, 'item stays', 'items stay')} where ${it(L.order, 'it is', 'they are')} in the order:`, `${names(L.order)}.`);
		if (L.gone.length) line(left, `${count(L.gone.length, 'item that is gone isn’t', 'items that are gone aren’t')} made again:`, `${names(L.gone)}.${L.gone.some((r) => r.kind === 'note') ? ' A note can be brought back by itself: open it in the snapshot.' : ''}`);
		if (L.elsewhere.length) line(left, `${count(L.elsewhere.length, 'item stays', 'items stay')} in the folder ${it(L.elsewhere, 'it is', 'they are')} in now:`, `${names(L.elsewhere)}.`);
		if (L.renamed.length) line(left, `${count(L.renamed.length, 'item keeps', 'items keep')} the name ${it(L.renamed, 'it has', 'they have')} now:`, L.renamed.slice(0, 3).map((r) => `“${r.renamed ?? ''}” (it was “${r.name}”)`).join(', ') + (L.renamed.length > 3 ? ` and ${(L.renamed.length - 3).toLocaleString()} more.` : '.'));
		if (L.props.length) { const all = [...new Set(L.props.flatMap((r) => r.props))]; line(left, `${count(L.props.length, 'item keeps', 'items keep')} the properties ${it(L.props, 'it has', 'they have')} now:`, `${all.slice(0, 6).join(', ')}${all.length > 6 ? ` and ${all.length - 6} more` : ''}.`); }
		if (L.fresh.length) line(left, `${count(L.fresh.length, 'item that is new since stays', 'items that are new since stay')} where ${it(L.fresh, 'it is', 'they are')}:`, `${names(L.fresh)}. Nothing is deleted.`);
		if (A) {
			if (A.stays.length) line(left, `${count(A.stays.length, 'item that is new since stays', 'items that are new since stay')} where ${it(A.stays, 'it is', 'they are')}:`, `${names(A.stays)}. Nothing is deleted.`);
			if (A.named.length) line(left, `${count(A.named.length, 'item can’t have the name it had', 'items can’t have the names they had')}, which ${it(A.named, 'an item', 'items')} new since ${it(A.named, 'has', 'have')} now:`, `${some(A.named.map((n) => (n.row.gone ? `“${n.row.name}” comes back as “${n.as}”` : `“${n.row.name}” will be “${n.as}”`)))}.`);
			if (A.ownStay.length) line(left, `${count(A.ownStay.length, 'folder keeps', 'folders keep')} the note made for ${it(A.ownStay, 'it', 'them')} since:`, `${names(A.ownStay)}.`);
			if (A.cannot.length) line(left, `${count(A.cannot.length, 'file that is gone can’t', 'files that are gone can’t')} be made again:`, `${names(A.cannot)}. A snapshot keeps notes; other files are only listed in it.`);
			if (A.places.some((x) => x.from != null) && !updatesLinks(this.app)) line(left, 'Links to what is renamed or moved stay as they are written:', '“Automatically update internal links” is off in Obsidian’s settings.');
		}
		if (left.childElementCount) {
			el.createEl('p', { cls: 'binders-folder-snapshots-plan-head', text: 'Left as it is now:' });
			el.appendChild(left);
		}
		// what is new since: a choice only when everything comes back, something is, and there are folders to make
		const choice = !!A && (!!A.gather || A.stays.some((r) => r.kind !== 'file')) && this.plugin.binders.binderOf(this.folder)?.kind !== 'longform';
		this.sinceSetting.settingEl.toggle(choice);
		this.sinceSetting.setDesc(this.since === 'gather' ? 'Goes into one folder at the end. Nothing is deleted.' : 'Stays where it is, after the item it follows now.');
		this.go.setDisabled(p.nothing || p.unsafe || this.busy);
	}

	private async run(): Promise<void> {
		const { plugin, s, folder } = this, plan = this.plan;
		if (this.busy || plan.nothing || plan.unsafe) return;
		this.busy = true;
		this.go.setDisabled(true);
		// (said as it goes when it is long: each note is a write, or an editor's change and its save)
		const going = plan.texts.length + (plan.all ? plan.all.places.length + plan.all.files.length : 0) > 20 ? say(`Bringing back ${quoted(s)}…`, 0) : null;
		try {
			await commitFields(plugin);
			const r = await bringBackFolder(plugin, s, folder, plan, (done, of) => { if (done % 10 === 0) going?.setMessage(`Bringing back ${quoted(s)}: ${done.toLocaleString()} of ${plan.all ? count(of, 'step') : count(of, 'note')}…`); });
			going?.hide();
			this.close();
			const did = plan.all
				? [r.again ? `${count(r.again, 'item')} made again` : '', r.placed ? `${count(r.placed, 'item')} put back where ${r.placed === 1 ? 'it was' : 'they were'}` : '', r.files ? `${count(r.files, 'note')} as ${r.files === 1 ? 'it was' : 'they were'}` : '', r.ordered && !r.orderLeft ? 'the order' : '', r.gathered ? `${count(r.gathered, 'item')} that ${r.gathered === 1 ? 'is' : 'are'} new since moved into “${r.into}”` : ''].filter((x) => x)
				: [r.texts ? `the text of ${count(r.texts, 'note')}` : '', r.moved ? `the place of ${count(r.moved, 'item')} in the order` : ''].filter((x) => x);
			let said = !did.length ? `Nothing was brought back from ${quoted(s)}.` : plan.all ? `Brought back ${quoted(s)}: ${did.join(', ')}.` : `Brought back ${did.join(' and ')} from ${quoted(s)}.`;
			if (r.left.length) said += ` ${count(r.left.length, plan.all ? 'item was' : 'note was', plan.all ? 'items were' : 'notes were')} left as ${r.left.length === 1 ? 'it is' : 'they are'}: ${r.left.slice(0, 3).map((l) => `“${l.name}” (${l.why})`).join(', ')}${r.left.length > 3 ? ` and ${(r.left.length - 3).toLocaleString()} more` : ''}.`;
			if (r.orderLeft) said += ' The order was left as it is: the items changed meanwhile.';
			const before = r.before.title ? `“${r.before.title}”` : `from ${whenIn(r.before.taken)}`;
			if (did.length) said += plan.all ? ` Nothing was deleted. “${folder.name}” as it was just before is kept as the snapshot ${before}: bring that one back to take this back (“Undo last move” doesn’t).` : ` “${folder.name}” as it was just before is kept as the snapshot ${before}.`;
			say(said, plan.all ? 15000 : 10000);
			this.done();
		} catch (e) {
			going?.hide();
			this.busy = false;
			tell(e);
			// (stopped part of the way: its plan is still written down, and says what can be done about it)
			const cut = plan.all ? await interruptedIn(plugin, folder).catch((): null => null) : null;
			if (cut) { this.close(); this.done(); new InterruptedModal(plugin, cut, this.done).open(); }
			else if (this.go.buttonEl.isConnected) this.draw();
		}
	}
}

/** A bringing back of everything that was cut short (Obsidian closed, a file couldn't be moved): says so, and offers
    to finish it or to put things back as they were. Either one is an ordinary bringing back, of the same snapshot or
    of the one taken first: it opens the screen that says what it will change. Closing this leaves the question for
    the next time. */
class InterruptedModal extends Modal {
	constructor(private plugin: BindersPlugin, private cut: Interrupted, private done?: () => void) { super(plugin.app); }

	onOpen(): void {
		const { contentEl, cut } = this, j = cut.journal, name = cut.folder?.name ?? cut.binder.folder.name;
		this.modalEl.addClass('binders-folder-snapshots-interrupted');
		if (!j) {
			// (a plan this version can't read is a newer Binders': it is left as it is, and nothing is brought back over it)
			this.setTitle('A snapshot is being brought back');
			contentEl.createEl('p', { text: `A newer version of Binders has brought a snapshot back in “${cut.binder.folder.name}”, and the plan it wrote down is still there. Update Binders to bring a snapshot back here.` });
			cancelButton(buttonRow(this), this).setButtonText('Close');
			return;
		}
		this.setTitle(j.title ? `Bringing back “${j.title}” was interrupted` : 'Bringing back a snapshot was interrupted');
		contentEl.createEl('p', { text: `“${name}” was being put back as it stood in a snapshot when that stopped. Some of it may be done, and some not. Nothing was deleted${cut.before ? `, and “${name}” as it was just before is kept as the snapshot ${quoted(cut.before)}` : ''}.` });
		const can = !!cut.folder && (!!cut.snapshot || !!cut.before);
		contentEl.createEl('p', { cls: 'u-muted', text: can ? 'Finishing it, or putting things back, shows what will change first.' : 'The snapshots it was working from aren’t there any more, so it can’t be finished here. Look through the notes, and bring back a snapshot if something is missing.' });
		const row = buttonRow(this);
		if (cut.folder && cut.snapshot) new ButtonComponent(row).setButtonText('Finish').setCta().onClick(() => void this.take(cut.snapshot, j?.since ?? 'stay', 'It was finished already: everything in the snapshot is there as it was.'));
		if (cut.folder && cut.before) new ButtonComponent(row).setButtonText('Put it back as it was').onClick(() => void this.take(cut.before, 'stay', 'Nothing had been changed: everything is as it was before.'));
		new ButtonComponent(row).setButtonText('Leave it as it is').onClick(() => void this.leave());
	}

	onClose(): void { this.contentEl.empty(); }

	/** Takes it up again: the same screen as any bringing back, on the folder as it is now. */
	private async take(s: FolderSnapshot | null, since: Since, nothing: string): Promise<void> {
		const { plugin, cut } = this, folder = cut.folder;
		if (!s || !folder) return;
		try {
			await commitFields(plugin);
			const now = await stateNow(plugin, folder), then = await readFolderSnapshot(plugin, s, folder);
			if (then.damaged.length) throw new Error('This snapshot’s file isn’t as it was written, so nothing is brought back from it.');
			const plan = planBack(changes(then.entries, now.entries, { words: false, yaml: parseYaml }), then.entries, now.entries, 'all', backOptions(plugin, s, folder, since));
			this.close();
			if (plan.nothing && !plan.unsafe) { await forgetInterrupted(plugin, cut); say(nothing, 8000); this.done?.(); return; }
			new BringBackModal(plugin, folder, s, then, now, () => this.done?.(), { scope: 'all', since }).open();
		} catch (e) { tell(e); }
	}

	private async leave(): Promise<void> {
		try { await forgetInterrupted(this.plugin, this.cut); this.close(); this.done?.(); } catch (e) { tell(e); }
	}
}

/** Says of every bringing back that was cut short that it was: asked when Binders loads. */
export async function showInterrupted(plugin: BindersPlugin): Promise<void> {
	for (const cut of await interrupted(plugin)) new InterruptedModal(plugin, cut).open();
}

// ---- menus, and the button in a binder view's header ----

/** "Take a snapshot" and "Show snapshots..." of a folder, for a menu: the same two a note has. In a binder that can't
    be changed, only the reading. */
export function folderItems(plugin: BindersPlugin, menu: Menu, folder: TFolder, section: string | null, readOnly = false): void {
	if (!hasSnapshots(plugin, folder)) return;
	const ro = readOnly || !!plugin.binders.problem(folder);
	if (!ro) menu.addItem((i) => { if (section) i.setSection(section); i.setTitle('Take a snapshot').setIcon('camera').onClick(() => void takeFolder(plugin, folder)); });
	menu.addItem((i) => { if (section) i.setSection(section); i.setTitle('Show snapshots...').setIcon('history').onClick(() => new FolderSnapshotsModal(plugin, folder).open()); });
}

/** The button's menu, under it, as a note's header button opens its own. */
export function headerFolderSnapshots(plugin: BindersPlugin, folder: TFolder, button: HTMLElement): void {
	const menu = new Menu(), r = button.getBoundingClientRect();
	folderItems(plugin, menu, folder, null);
	menu.showAtPosition({ x: r.left, y: r.bottom + 4, width: r.width, overlap: true, left: false }, button.doc);
}
