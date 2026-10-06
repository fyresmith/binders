import { ButtonComponent, Component, MarkdownRenderer, Menu, Modal, Platform, TFile, TFolder, parseYaml, setIcon } from 'obsidian';
import type BindersPlugin from '../main';
import { forRender, parts } from '../scene-text';
import { changes, type Changes, type Row } from '../binder-snapshot-text';
import { deleteFolderSnapshot, folderSnapshots, forgetRead, hasSnapshots, isNewer, makeFromSnapshot, nameFolderSnapshot, readFolderSnapshot, remakeNote, sizeOfSnapshot, stateNow, takeFolderSnapshot, type FolderSnapshot, type Read, type State } from '../binder-snapshots';
import { badSnapshotName } from '../snapshot-text';
import { bringBackText, isScene } from '../snapshots';
import { commitAll } from './edit';
import { historyLook, submenu, trashPhrase } from './internals';
import { ask, cancelButton, confirm } from './modals';
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

/** "Take a snapshot" of a folder: no questions. Says what it did, and how big the folder is. */
export async function takeFolder(plugin: BindersPlugin, folder: TFolder, title = ''): Promise<void> {
	try {
		// a synopsis, a title or a cell being typed in, in any window: saved first, as the views save them, so it is in
		const docs = new Set<Document>([activeDocument]);
		plugin.app.workspace.iterateAllLeaves((l) => { docs.add(l.view.containerEl.doc); });
		for (const d of docs) await commitAll(d.body, true);
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
			this.namedEl = iconButton(head, 'filter', 'Only snapshots with a name', () => { this.namedOnly = !this.namedOnly; void this.load(); });
			if (can) iconButton(head, 'camera', 'Take a snapshot', this.takeOne);
		} else {
			const head = inner.createDiv({ cls: 'binders-snapshots-head' });
			if (can) new ButtonComponent(head).setButtonText('Take a snapshot').onClick(this.takeOne);
			this.namedEl = iconButton(head, 'filter', 'Only snapshots with a name', () => { this.namedOnly = !this.namedOnly; void this.load(); });
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
		const seen = (path: string) => { if (store.inSnapshots(path)) void this.load(); else if (path.startsWith(this.folder.path + '/')) this.now = null; };
		this.rendered.registerEvent(vault.on('create', (f) => seen(f.path)));
		this.rendered.registerEvent(vault.on('delete', (f) => seen(f.path)));
		this.rendered.registerEvent(vault.on('modify', (f) => { if (!store.inSnapshots(f.path) && f.path.startsWith(this.folder.path + '/')) this.now = null; }));
		this.rendered.registerEvent(vault.on('rename', (f, old) => { seen(f.path); seen(old); }));
		void this.load(true);
	}

	onClose(): void { this.seen?.disconnect(); this.rendered.unload(); this.drawn.unload(); this.contentEl.empty(); forgetRead(); }

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
		const rows = c ? (marked ? c.rows : c.rows.filter((r) => r.then)) : changes(then.entries, then.entries, { words: false }).rows;
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
