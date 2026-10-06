import { ButtonComponent, Component, FuzzySuggestModal, ItemView, MarkdownRenderer, MarkdownView, Menu, Modal, Notice, Platform, Setting, TFile, TFolder, TextComponent, htmlToMarkdown, setIcon, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { forRender, parts } from '../scene-text';
import { saveOpen } from '../scenes';
import { SNAPSHOT_EXT, badSnapshotName, compare, readSnapshot, readSnapshotName, reworded, type Row, type Stretch } from '../snapshot-text';
import { attach, bringBack, isScene, leftovers, nameSnapshot, rewrite, snapshotsDir, snapshotsIn, takeSnapshot, type Leftover, type Snapshot } from '../snapshots';
import { liveEditors } from './editable-embed';
import { historyLook, refreshHeader, submenu, trashPhrase } from './internals';
import { ask, buttonRow, cancelButton, confirm } from './modals';
import { folderItems } from './binder-snapshots';
import { wordsIn, wordsLabel } from './words';

/* Snapshots, to the writer: "Take a snapshot", "Rewrite", the dialog that lists a note's snapshots, and a pane that
   shows one beside the note. The dialog is laid out as Obsidian's own File recovery and Sync history dialogs are, with
   their classes (a list at the side, the text beside it, "show changes" drawn as their diff is), so it looks like them
   in any theme, and on a phone it's a sheet whose list leads to the text, as theirs is. Where this Obsidian has no
   such classes, Binders' own rules lay it out the same way (see `historyLook` in internals.ts). */

const tell = (e: unknown) => { say(e instanceof Error ? e.message.replace(/^E[A-Z]+: /, '') : typeof e === 'string' ? e : 'That didn’t work.'); };
/** "Today at 14:32", "Yesterday at 09:15", "Sep 12, 2026, 9:15 AM". */
export const when = (ms: number): string => window.moment(ms).calendar(null, { sameDay: '[Today at] LT', lastDay: '[Yesterday at] LT', lastWeek: 'dddd [at] LT', sameElse: 'll, LT' });
/** The same inside a sentence: "today at 14:32". */
export const whenIn = (ms: number): string => when(ms).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase());
/** In a list, to take in at a glance: the same for the last week ("Today at 14:32", "Sunday at 09:15"), then the day
    and time without the year ("Sep 12, 9:15 AM"), and in another year the day alone ("Aug 27, 2025"). */
export function whenShort(ms: number): string {
	const m = window.moment(ms), now = window.moment(), days = now.clone().startOf('day').diff(m.clone().startOf('day'), 'days');
	if (days < 7) return when(ms);
	if (m.year() !== now.year()) return m.format('ll');
	let day: string;
	try { day = new Intl.DateTimeFormat(window.moment.locale(), { month: 'short', day: 'numeric' }).format(ms); } catch { day = m.format('MMM D'); }
	return `${day}, ${m.format('LT')}`;
}
/** Says something as Obsidian's notices do. Over one of these dialogs a notice lies on the bar's buttons for as long
    as it shows, and would take the click meant for one of them: there, it lets the click through. */
export function say(text: string, ms?: number): Notice {
	const n = new Notice(text, ms), el = (n.containerEl) ?? n.messageEl?.parentElement;
	if (el?.doc.querySelector('.modal.binders-snapshots')) el.addClass('binders-notice-over-dialog');
	return n;
}
const copyText = (text: string): void => { void navigator.clipboard.writeText(text).then(() => say('Copied the text.'), tell); };
const notes = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'note' : 'notes'}`;

/** "Take a snapshot": no questions. Says what it did. With a name (a whole folder's, taken together), every note with
    text gets one, changed or not, so the name is there on each. */
export async function take(plugin: BindersPlugin, scenes: TFile[], title = ''): Promise<void> {
	let made = 0, same = 0;
	try {
		for (const f of scenes) { const r = await takeSnapshot(plugin, f, title); if (r?.made) made++; else if (r) same++; }
	} catch (e) {
		// (said with how far it got: the ones taken are there)
		say(`${made ? `Took a snapshot of ${notes(made)}, then stopped. ` : ''}${e instanceof Error ? e.message : String(e)}`, 8000);
		return;
	}
	const one = scenes.length === 1 ? `“${scenes[0].basename}”` : null;
	if (made) say(`Took a snapshot of ${one ?? notes(made)}${title ? `, named “${title}”` : ''}.${!one && same ? ` ${same === 1 ? 'One hasn’t' : `${same} haven’t`} changed since ${same === 1 ? 'its' : 'their'} last snapshot.` : ''}`);
	else if (same) say(one ? `${one} hasn’t changed since its last snapshot.` : 'None of them has changed since its last snapshot.');
	else say(one ? 'There’s no text to take a snapshot of yet.' : 'None of them has any text yet.');
}

/** "Rewrite": a snapshot of the text as it is; the writer starts again from it, or from a blank page. */
export class RewriteModal extends Modal {
	private name: TextComponent;
	private error: HTMLElement;
	constructor(private plugin: BindersPlugin, private scene: TFile, private then: (blank: boolean, kept: Snapshot) => void) { super(plugin.app); }

	onOpen(): void {
		this.setTitle(`Rewrite “${this.scene.basename}”`);
		this.contentEl.createEl('p', { text: 'A snapshot of the text as it is now is taken first, to read, compare and bring back whenever you like. Then start again: from this text, or from a blank page.' });
		const box = this.contentEl.createDiv({ cls: 'binders-ask' });
		this.name = new TextComponent(box).setPlaceholder('A name for the snapshot, if you like');
		this.name.inputEl.setAttr('aria-label', 'Name for the snapshot');
		this.name.inputEl.setAttr('enterkeyhint', 'done');
		this.error = this.contentEl.createDiv({ cls: 'binders-ask-error', attr: { 'aria-live': 'polite' } });
		this.name.inputEl.addEventListener('input', () => this.refuse(null));
		this.name.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void this.run(false); } });
		const row = buttonRow(this);
		new ButtonComponent(row).setButtonText('Start from this text').setCta().onClick(() => void this.run(false));
		new ButtonComponent(row).setButtonText('Start from a blank page').onClick(() => void this.run(true));
		cancelButton(row, this);
	}

	onClose(): void { this.contentEl.empty(); }

	private refuse(why: string | null): void { this.error.setText(why ?? ''); this.name.inputEl.toggleClass('is-invalid', !!why); }

	private async run(blank: boolean): Promise<void> {
		const title = this.name.getValue().trim(), bad = title ? badSnapshotName(title) : null;
		if (bad) { this.refuse(bad); this.name.inputEl.focus(); return; }
		try {
			const kept = await rewrite(this.plugin, this.scene, blank, title);
			this.close();
			if (kept) this.then(blank, kept); else say('There’s no text to take a snapshot of yet: the page is blank already.');
		} catch (e) { this.refuse(e instanceof Error ? e.message : String(e)); }
	}
}

/** What "Rewrite" leads to: the note ready to write in (where it's being written already: its tab, or the manuscript)
    and, after a blank page, the snapshot just taken beside it (on a phone there's no beside: it's under "Snapshots"). */
export function startRewrite(plugin: BindersPlugin, scene: TFile): void {
	new RewriteModal(plugin, scene, (blank, kept) => {
		void (async () => {
			const ws = plugin.app.workspace;
			const tab = ws.getLeavesOfType('markdown').find((l) => l.view instanceof MarkdownView && l.view.file === scene);
			// in a manuscript, the page it's on is where it's written: no tab is opened over it
			const inManuscript = !tab && liveEditors(scene).length > 0;
			const leaf = tab ?? (inManuscript ? ws.getMostRecentLeaf() : ws.getLeaf(false));
			if (!tab && !inManuscript && leaf) await leaf.openFile(scene, { state: { mode: 'source' } });
			if (blank && !Platform.isPhone) await openSnapshot(plugin, kept.file, scene, 'split');
			if (leaf) ws.setActiveLeaf(leaf, { focus: true });
			if (leaf?.view instanceof MarkdownView && leaf.view.getMode() === 'source') leaf.view.editor.focus();
			// (in the manuscript, the cursor back in the section it was in)
			if (inManuscript && !Platform.isMobile) liveEditors(scene)[0]?.editor?.focus();
			say(blank ? `A blank page for “${scene.basename}”. Its text is kept as a snapshot${kept.title ? `, “${kept.title}”` : ''}.` : `Took a snapshot of “${scene.basename}”${kept.title ? `, named “${kept.title}”` : ''}.`, blank ? 6000 : undefined);
		})().catch(tell);
	}).open();
}

// ---- a snapshot in a pane of its own ----

export const SNAPSHOT_VIEW = 'binders-snapshot';

/** A snapshot shown as a note reads, in a tab or beside the note it's of. It's a file Obsidian doesn't open (it isn't
    a note), so this view reads it. Nothing can be typed in it. */
export class SnapshotView extends ItemView {
	private path = '';
	private of = '';
	private shown = new Component();
	constructor(leaf: WorkspaceLeaf, private plugin: BindersPlugin) { super(leaf); this.navigation = true; }
	getViewType(): string { return SNAPSHOT_VIEW; }
	getIcon(): string { return 'history'; }
	getDisplayText(): string {
		const name = this.path.slice(this.path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, ''), named = readSnapshotName(name, this.beside());
		const what = named ? named.title || when(named.when.getTime()) : name;
		return this.path ? `${this.of ? this.of.slice(this.of.lastIndexOf('/') + 1).replace(/\.md$/i, '') + ': ' : ''}${what}` : 'Snapshot';
	}
	/** Is a snapshot of this name beside the one shown? (A count after a name is told from a number the writer typed.) */
	private beside(): (name: string) => boolean {
		const dir = this.path.slice(0, this.path.lastIndexOf('/'));
		return (name) => !!this.app.vault.getAbstractFileByPath(`${dir}/${name}.${SNAPSHOT_EXT}`);
	}
	getState(): Record<string, unknown> { return { file: this.path, of: this.of }; }
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = (state ?? {}) as { file?: unknown; of?: unknown };
		this.path = typeof s.file === 'string' ? s.file : '';
		this.of = typeof s.of === 'string' ? s.of : '';
		await this.draw();
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		this.contentEl.addClass('binders-snapshot-view');
		this.shown.load();
		const { vault } = this.app;
		this.registerEvent(vault.on('rename', (f, old) => { if (old === this.path) { this.path = f.path; void this.draw(); } else if (old === this.of) this.of = f.path; }));
		this.registerEvent(vault.on('delete', (f) => { if (f.path === this.path) this.leaf.detach(); }));
		await this.draw();
	}
	async onClose(): Promise<void> { this.shown.unload(); await Promise.resolve(); }

	private async draw(): Promise<void> {
		const el = this.contentEl, file = this.app.vault.getAbstractFileByPath(this.path);
		el.empty();
		this.shown.unload();
		this.shown = new Component();
		this.shown.load();
		const page = el.createDiv({ cls: 'binders-snapshot-page markdown-rendered' });
		refreshHeader(this);
		if (!(file instanceof TFile) || file.extension !== SNAPSHOT_EXT) { if (this.path) page.createDiv({ cls: 'binders-snapshot-of', text: 'This snapshot isn’t there any more.' }); return; }
		const named = readSnapshotName(file.basename, this.beside()), read = readSnapshot(await this.app.vault.cachedRead(file));
		const at = named?.when.getTime() ?? read.taken ?? file.stat.mtime, title = named ? named.title : file.basename;
		page.createDiv({ cls: 'binders-snapshot-of', text: `Snapshot${title ? ` “${title}”` : ''}, taken ${whenIn(at)} · ${wordsLabel(wordsIn(this.plugin, read.body))}` });
		if (read.body.trim()) await MarkdownRenderer.render(this.app, forRender(this.plugin.paragraphs.forRender(read.body, this.of || file.path)), page, this.of || file.path, this.shown);
		else page.createDiv({ cls: 'binders-snapshot-of', text: 'A blank page.' });
		copyAsMarkdown(page);
		refreshHeader(this);
	}
}

/** What's selected in a snapshot is copied as the Markdown it is, to paste back into the note. */
function copyAsMarkdown(el: HTMLElement): void {
	el.addEventListener('copy', (e) => {
		const sel = el.win.getSelection();
		if (!sel || sel.isCollapsed || !e.clipboardData) return;
		const box = createDiv();
		box.appendChild(sel.getRangeAt(0).cloneContents());
		e.clipboardData.setData('text/plain', htmlToMarkdown(box));
		e.preventDefault();
	});
}

/** Shows a snapshot in a pane: beside what's in front (`split`), or in a tab. One that's open already comes forward. */
export async function openSnapshot(plugin: BindersPlugin, file: TFile, scene: TFile | null, where: 'split' | 'tab'): Promise<void> {
	const ws = plugin.app.workspace;
	const open = ws.getLeavesOfType(SNAPSHOT_VIEW).find((l) => (l.getViewState().state as { file?: unknown } | undefined)?.file === file.path);
	const leaf = open ?? (where === 'split' ? ws.getLeaf('split', 'vertical') : ws.getLeaf('tab'));
	await leaf.setViewState({ type: SNAPSHOT_VIEW, state: { file: file.path, of: scene?.path ?? '' }, active: false });
	if (open) ws.setActiveLeaf(open, { focus: false });
}

/** What changed between two texts, as prose, into `el` (a `sync-history-diff`): the later text's paragraphs with what
    was taken out struck through and what was put in marked, each where it falls; long stretches that are the same
    fold away. `lead` says what is compared, before the key to the marks. */
export function proseChanges(el: HTMLElement, before: string, after: string, lead: string | null = 'Since this snapshot: '): void {
	// since this snapshot: what was taken out, what was put in, said once in the marks themselves
	if (lead != null) {
		const key = el.createDiv({ cls: 'binders-snapshots-key' });
		key.appendText(lead);
		key.createEl('del', { text: 'Taken out' });
		key.appendText(' ');
		key.createEl('ins', { text: 'Put in' });
	}
	// the note's own paragraphs with the changes marked in them where they fall: prose, not two columns of lines
	const view = el.createDiv({ cls: 'binders-snapshots-changes' });
	const para = (parts: Stretch[]): HTMLElement => {
		const p = createEl('p');
		parts.forEach((x, i) => {
			if (i) p.appendText(' ');
			const t = x.words.join(' ');
			if (x.kind === 'same') p.appendText(t); else p.createEl(x.kind === 'old' ? 'del' : 'ins', { text: t });
		});
		return p;
	};
	const whole = (r: Row): string[] => [r.pieces.map((p) => p.text).join('')];
	let run: HTMLElement[] = [];
	const fold = (last: boolean) => {
		// a long stretch that's the same folds away, a paragraph of it left on either side of a change
		const head = view.childElementCount ? 1 : 0, tail = last ? 0 : 1;
		if (run.length > head + tail + 1) {
			const hidden = run.slice(head, run.length - tail), note = createDiv({ cls: 'diff-collapsed binders-snapshots-folded', text: `${hidden.length} paragraphs the same`, attr: { role: 'button', tabindex: '0' } });
			for (const el of run.slice(0, head)) view.appendChild(el);
			view.appendChild(note);
			for (const el of run.slice(run.length - tail)) view.appendChild(el);
			const unfold = () => { for (const el of hidden) view.insertBefore(el, note); note.detach(); };
			note.addEventListener('click', unfold);
			note.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unfold(); } });
		} else for (const el of run) view.appendChild(el);
		run = [];
	};
	const rows = compare(before, after);
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i], next = rows[i + 1];
		if (r.kind === 'same') { run.push(para([{ kind: 'same', words: whole(r) }])); continue; }
		fold(false);
		// a paragraph reworded comes as its old self then its new one, each in pieces (the words both have, the words
		// only it has): here, one paragraph. One taken out followed by another put in are each a single piece.
		if (r.kind === 'old' && next?.kind === 'new' && (r.pieces.length > 1 || next.pieces.length > 1)) { view.appendChild(para(reworded(r.pieces, next.pieces))); i++; }
		else view.appendChild(para([{ kind: r.kind, words: whole(r) }]));
	}
	fold(true);
}

// ---- the dialog ----

/** An icon that's a button: pressed by a click, Enter or Space, and named for a screen reader (and in its tooltip). */
export function iconButton(parent: HTMLElement, icon: string, name: string, press: () => void): HTMLElement {
	const el = parent.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': name, role: 'button', tabindex: '0' } });
	setIcon(el, icon);
	el.addEventListener('click', press);
	el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } });
	return el;
}

/** The snapshots of a scene (or, with `left`, of a note that's gone): a list, newest first, and beside it the one
    chosen, to read or to compare with the note as it is now. With none yet, it says what a snapshot is and offers to
    take one. */
export class SnapshotsModal extends Modal {
	private side: HTMLElement;
	private listEl: HTMLElement;
	private pane: HTMLElement;
	private nameEl: HTMLElement;
	private detailEl: HTMLElement;
	private actions: HTMLElement;
	private textEl: HTMLElement;
	private diffEl: HTMLElement;
	private emptyEl: HTMLElement;
	private emptyRow: HTMLElement;
	private back: HTMLElement | null = null;
	private list: Snapshot[] = [];
	/** The snapshot shown (null: the note as it is now; undefined: none, a phone's list). */
	private shown: Snapshot | null | undefined = undefined;
	/** Laid out as a list beside a text (true), or as a plain dialog that says there are none (false). */
	private full: boolean | null = null;
	private changes = false;
	private current = '';
	private rendered = new Component();
	private loading = 0;
	private readonly scene: TFile | null;
	private readonly dir: string;
	private readonly name: string;
	/** Nothing can be changed: the binder is in a newer format (`why` says so, in the plugin's own words). */
	private readonly readOnly: boolean;
	private readonly why: string;

	/** `open`: the snapshot to open on (its file), where the dialog would open on the newest. */
	constructor(private plugin: BindersPlugin, of: TFile | Leftover, private opening: TFile | null = null) {
		super(plugin.app);
		this.scene = of instanceof TFile ? of : null;
		this.dir = of instanceof TFile ? snapshotsDir(plugin, of) ?? '\0' : of.dir.path;
		this.name = of instanceof TFile ? of.basename : of.path.slice(of.path.lastIndexOf('/') + 1);
		const problem = plugin.binders.problem(this.dir);
		this.readOnly = !!problem;
		this.why = `This binder can’t be changed. ${problem ?? ''}`;
	}

	private heading(): string { return `Snapshots of “${this.name}”`; }
	private takeOne = (): void => { if (this.scene) void take(this.plugin, [this.scene]); };

	onOpen(): void {
		const { modalEl } = this, scene = this.scene;
		this.setTitle(this.heading());
		modalEl.addClass('binders-snapshots');
		// the list, under whose snapshots these are and (always in reach) the way to take one now
		this.side = createDiv({ cls: 'modal-sidebar mod-history binders-snapshots-side' });
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		// (a phone has the dialog's own title above the list: there, only the button, in words)
		const can = !!scene && !this.readOnly;
		if (!Platform.isPhone) {
			const head = inner.createDiv({ cls: 'binders-snapshots-head' });
			head.createDiv({ cls: 'binders-snapshots-of', text: this.name });
			if (can) iconButton(head, 'camera', 'Take a snapshot', this.takeOne);
		} else if (can) new ButtonComponent(inner.createDiv({ cls: 'binders-snapshots-head' })).setButtonText('Take a snapshot').onClick(this.takeOne);
		this.listEl = inner.createDiv({ cls: 'modal-sidebar-list binders-snapshots-list', attr: { role: 'listbox', 'aria-label': this.heading() } });
		if (this.readOnly) inner.createDiv({ cls: 'binders-snapshots-note', text: this.why });
		// the one chosen: what it is, what can be done with it, and its text
		this.pane = createDiv({ cls: 'sync-history-content-container binders-snapshots-pane' });
		const content = this.pane.createDiv({ cls: 'sync-history-content' });
		const bar = content.createDiv({ cls: 'modal-setting-titlebar binders-snapshots-bar' });
		const title = bar.createDiv({ cls: 'modal-setting-title binders-snapshots-title' });
		this.nameEl = title.createSpan({ cls: 'binders-snapshots-name' });
		this.detailEl = title.createSpan({ cls: 'binders-snapshots-detail' });
		this.actions = bar.createDiv({ cls: 'modal-setting-titlebar-actions' });
		this.textEl = content.createDiv({ cls: 'sync-history-preview markdown-rendered binders-snapshots-text' });
		this.diffEl = content.createDiv({ cls: 'sync-history-diff binders-snapshots-diff' });
		copyAsMarkdown(this.textEl);
		this.emptyEl = createDiv({ cls: 'binders-snapshots-empty' });
		this.emptyRow = createDiv({ cls: 'modal-button-container' });
		if (Platform.isPhone) {
			this.back = createDiv({ cls: 'clickable-icon modal-setting-back-button mod-raised', attr: { 'aria-label': 'Back to the list', role: 'button' } });
			setIcon(this.back, 'arrow-left');
			this.back.addEventListener('click', () => this.toList());
		}
		this.rendered.load();
		// the list follows the vault while the dialog is open: a snapshot taken, named or deleted, here or elsewhere
		const { vault } = this.app, mine = (path: string) => path.startsWith(this.dir + '/') || path === this.dir;
		this.rendered.registerEvent(vault.on('create', (f) => { if (mine(f.path)) void this.load(); }));
		this.rendered.registerEvent(vault.on('delete', (f) => { if (mine(f.path)) void this.load(); }));
		this.rendered.registerEvent(vault.on('rename', (f, old) => { if (mine(f.path) || mine(old)) void this.load(); }));
		void this.load(true);
	}

	onClose(): void { this.rendered.unload(); this.contentEl.empty(); }

	/** The dialog's two shapes: Obsidian's File recovery layout (or, where it has none, ours) when there's a list to
	    show, and one of its small dialogs (a sheet on a phone, as `buttonRow` makes them) when there's none. */
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
		// Obsidian's own look for such a dialog, or (where it has none) ours
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

	/** With no snapshots: what one is, and the way to take the first. */
	private none(): void {
		const el = this.emptyEl, row = this.emptyRow, scene = this.scene;
		el.empty();
		row.empty();
		if (!scene) el.createEl('p', { text: 'These snapshots are gone.' });
		else el.createEl('p', { text: 'A snapshot keeps this note’s text as it is now. Take one before a big change: later you can read it, see what has changed since, and bring it back.' });
		if (scene && this.readOnly) el.createEl('p', { cls: 'u-muted', text: this.why });
		if (scene && !this.readOnly) { new ButtonComponent(row).setButtonText('Take a snapshot').setCta().onClick(this.takeOne); cancelButton(row, this); }
		else cancelButton(row, this).setButtonText('Close');
	}

	private async load(first = false): Promise<void> {
		const turn = ++this.loading;
		let current = '';
		try {
			if (this.scene) { await saveOpen(this.app, [this.scene]); current = parts(await this.app.vault.read(this.scene)).body; }
		} catch (e) { tell(e); }
		const list = await snapshotsIn(this.app, this.dir);
		if (turn !== this.loading) return; // a later look is on its way
		this.current = current;
		this.list = list;
		// (the keyboard's place is kept: in the list, or on a button this is about to draw again)
		const active = this.modalEl.doc.activeElement, focused = [this.listEl, this.actions, this.emptyRow].some((el) => el.contains(active));
		const was = list.length ? this.shown : undefined;
		if (!list.length) { this.shown = undefined; this.none(); }
		this.layout(list.length > 0);
		this.listEl.empty();
		// (a phone is touched, not tabbed through: nothing is ringed as it opens)
		const focus = focused || (first && !Platform.isPhone);
		if (!list.length) { if (focus) this.emptyRow.querySelector('button')?.focus(); return; }
		const items: HTMLElement[] = [];
		const row = (s: Snapshot | null, name: string, detail: string, said: string) => {
			const el = this.listEl.createDiv({ cls: 'modal-sidebar-list-item file-recovery-list-item-header tappable binders-snapshots-item', attr: { tabindex: '-1', role: 'option', 'aria-selected': 'false', 'aria-label': said } });
			const d = el.createDiv({ cls: 'modal-sidebar-list-item-details' });
			d.createDiv({ cls: 'binders-snapshots-item-name', text: name });
			d.createDiv({ cls: 'binders-snapshots-item-detail u-muted', text: detail });
			const pick = (): void => { void this.show(s, el); };
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
			return el;
		};
		const rows = new Map<Snapshot | null, HTMLElement>();
		if (this.scene) {
			const words = wordsLabel(wordsIn(this.plugin, this.current)), el = row(null, 'The note now', words, `The note now, ${words}`);
			el.addClass('is-now');
			rows.set(null, el);
		}
		for (const s of list) {
			const at = whenShort(s.taken), words = wordsLabel(wordsIn(this.plugin, s.body));
			rows.set(s, row(s, s.title || at, s.title ? `${at} · ${words}` : words, `Snapshot${s.title ? ` “${s.title}”` : ''}, ${whenIn(s.taken)}, ${words}${this.scene && this.sameAsNote(s) ? ', the same as the note now' : ''}`));
		}
		// what was shown stays shown; otherwise the newest snapshot (a phone starts at the list)
		const again = was ? list.find((s) => s.file === was.file) ?? (this.scene ? null : list[0]) : was;
		// (asked for one, from the inspector's list: that one, as a click on its row here would show it)
		const asked = this.opening ? list.find((x) => x.file === this.opening) : undefined;
		this.opening = null;
		const pick = asked ?? (again !== undefined ? again : !Platform.isPhone ? list[0] : undefined);
		if (asked) await this.show(asked, rows.get(asked) ?? null);
		else if (pick !== undefined && !(Platform.isPhone && !this.pane.parentElement)) await this.show(pick, rows.get(pick) ?? null);
		else if (Platform.isPhone && this.pane.parentElement && (!was || !list.some((s) => s.file === was.file))) this.toList();
		// one stop for Tab: the row shown, or the first
		const stop = this.listEl.querySelector<HTMLElement>('.is-active') ?? items[0];
		stop?.setAttr('tabindex', '0');
		if (focus) stop?.focus();
	}

	private sameAsNote(s: Snapshot): boolean { return s.body.replace(/\r\n?/g, '\n') === this.current.replace(/\r\n?/g, '\n'); }

	/** Shows a snapshot (or the note as it is now) beside the list. */
	private async show(s: Snapshot | null, row: HTMLElement | null): Promise<void> {
		this.shown = s;
		for (const el of Array.from(this.listEl.querySelectorAll('.binders-snapshots-item'))) { el.removeClass('is-active'); el.setAttr('aria-selected', 'false'); if (row) el.setAttr('tabindex', '-1'); }
		row?.addClass('is-active');
		row?.setAttr('aria-selected', 'true');
		row?.setAttr('tabindex', '0');
		if (Platform.isPhone && !this.pane.parentElement) {
			this.side.detach();
			this.contentEl.appendChild(this.pane);
		}
		const scene = this.scene, text = s ? s.body : this.current, same = !!s && !!scene && this.sameAsNote(s);
		// which one this is: its name if it has one, else when it was taken
		const name = s ? s.title || when(s.taken) : 'The note now';
		this.nameEl.setText(name);
		this.detailEl.setText([s?.title ? when(s.taken) : '', wordsLabel(wordsIn(this.plugin, text)), same ? 'Same as the note now' : ''].filter((x) => x).join(' · '));
		// (a phone has the name where the dialog's title is, with the way back to the list beside it, as File recovery has)
		if (this.back) { this.setTitle(name); this.titleEl.appendChild(this.back); }
		this.actions.empty();
		const bring = !!s && !!scene && !this.readOnly;
		if (s && scene) {
			// quiet, as a toolbar's switch is in Obsidian: it changes what's shown, nothing else
			const el = this.actions.createDiv({ cls: 'text-icon-button binders-snapshots-compare', attr: { role: 'button', tabindex: same ? '-1' : '0', 'aria-pressed': String(this.changes && !same), 'aria-disabled': String(same) } });
			setIcon(el.createSpan({ cls: 'text-button-icon' }), 'diff');
			el.createSpan({ cls: 'text-button-label', text: 'Show changes' });
			el.toggleClass('is-active', this.changes && !same);
			el.toggleClass('is-disabled', same);
			if (same) el.setAttr('aria-label', 'This snapshot and the note have the same text');
			const flip = () => {
				if (same) return;
				this.changes = !this.changes;
				el.toggleClass('is-active', this.changes);
				el.setAttr('aria-pressed', String(this.changes));
				this.draw(s, text);
			};
			el.addEventListener('click', flip);
			el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
		}
		// (beside "Bring back", copying is in the menu: one thing stands out)
		if (!bring) new ButtonComponent(this.actions).setButtonText('Copy').onClick(() => copyText(text));
		if (!s && scene && !this.readOnly) new ButtonComponent(this.actions).setButtonText('Take a snapshot').setCta().onClick(this.takeOne);
		if (s && bring) new ButtonComponent(this.actions).setButtonText('Bring back').setCta().setDisabled(same).setTooltip(same ? 'The note already has this text' : 'Put this text in the note. A snapshot of the text there now is taken first.').onClick(() => void this.restore(s));
		if (s) {
			const more = iconButton(this.actions, 'more-horizontal', 'More', () => {
				const r = more.getBoundingClientRect();
				this.menu(s).showAtPosition({ x: r.right, y: r.bottom + 4, left: true }, more.doc);
			});
		}
		this.draw(s, text);
	}

	/** The text, to read; or what has changed since it was taken. */
	private draw(s: Snapshot | null, text: string): void {
		const changes = !!s && !!this.scene && this.changes && !this.sameAsNote(s);
		this.textEl.toggle(!changes);
		this.diffEl.toggle(changes);
		this.textEl.empty();
		this.diffEl.empty();
		if (!changes) {
			if (!text.trim()) this.textEl.createDiv({ cls: 'u-muted', text: 'A blank page.' });
			else void MarkdownRenderer.render(this.app, forRender(this.plugin.paragraphs.forRender(text, this.scene?.path ?? '')), this.textEl, this.scene?.path ?? '', this.rendered);
			this.textEl.scrollTop = 0;
			return;
		}
		proseChanges(this.diffEl, text, this.current);
		this.diffEl.scrollTop = 0;
	}

	private menu(s: Snapshot): Menu {
		const m = new Menu();
		m.addItem((i) => i.setTitle('Copy text').setIcon('copy').onClick(() => copyText(s.body)));
		if (!this.readOnly) m.addItem((i) => i.setTitle('Name this snapshot...').setIcon('pencil-line').onClick(async () => {
			const name = await ask(this.app, { title: 'Name this snapshot', placeholder: 'First draft, before the notes…', cta: 'Save', value: s.title, allowEmpty: true, check: (x) => (x ? badSnapshotName(x) : null) });
			if (name == null) return;
			try { await nameSnapshot(this.app, s, name); } catch (e) { tell(e); }
		}));
		// (a phone has no beside; there the dialog is the reader)
		if (!Platform.isPhone) m.addItem((i) => i.setTitle('Open to the right').setIcon('separator-vertical').onClick(() => {
			this.close();
			void openSnapshot(this.plugin, s.file, this.scene, 'split').catch(tell);
		}));
		if (!this.readOnly) {
			m.addSeparator();
			m.addItem((i) => i.setTitle('Delete snapshot').setIcon('trash-2').setWarning(true).onClick(async () => {
				const ok = await confirm(this.app, { title: 'Delete snapshot', text: `Delete the snapshot of “${this.name}” from ${whenIn(s.taken)}${s.title ? `, “${s.title}”` : ''}? It ${trashPhrase(this.app, false)}.`, cta: 'Delete', warning: true });
				if (!ok) return;
				try { await this.app.fileManager.trashFile(s.file); } catch (e) { tell(e); }
			}));
		}
		return m;
	}

	private async restore(s: Snapshot): Promise<void> {
		if (!this.scene) return;
		try {
			const { kept } = await bringBack(this.plugin, this.scene, s);
			say(`Brought back the snapshot from ${whenIn(s.taken)}.${kept ? ' The text it replaced is kept as a snapshot.' : ''}`, 6000);
			this.shown = s;
			await this.load();
		} catch (e) { tell(e); }
	}
}

// ---- snapshots whose note is gone ----

class ScenePicker extends FuzzySuggestModal<TFile> {
	constructor(private plugin: BindersPlugin, private binder: Binder, private picked: (f: TFile) => void) { super(plugin.app); this.setPlaceholder('Give the snapshots to...'); }
	getItems(): TFile[] { return this.plugin.binders.scenes(this.binder.folder).filter((f) => isScene(this.plugin, f)); }
	getItemText(f: TFile): string { return f.path.slice(this.binder.folder.path.length + 1).replace(/\.md$/i, ''); }
	onChooseItem(f: TFile): void { this.picked(f); }
}

/** "Snapshots of notes that are gone": notes deleted, merged away, moved out of the binder, or renamed where Binders
    couldn't see. Their snapshots are kept; here they're read, given to a note that's there, or deleted. */
export class LeftoversModal extends Modal {
	private watch = new Component();
	constructor(private plugin: BindersPlugin, private binder: Binder) { super(plugin.app); }

	onOpen(): void {
		this.setTitle('Snapshots of notes that are gone');
		this.modalEl.addClass('binders-leftovers');
		this.watch.load();
		const again = () => window.setTimeout(() => this.draw(), 120);
		this.watch.registerEvent(this.app.vault.on('create', again));
		this.watch.registerEvent(this.app.vault.on('delete', again));
		this.watch.registerEvent(this.app.vault.on('rename', again));
		this.draw();
	}

	onClose(): void { this.watch.unload(); this.contentEl.empty(); }

	private draw(): void {
		const { contentEl } = this, list = leftovers(this.plugin, this.binder), ro = !!this.binder.problem;
		contentEl.empty();
		contentEl.createEl('p', { cls: 'setting-item-description', text: list.length ? `Notes of “${this.binder.folder.name}” that were deleted, merged into another, or moved out of the binder. Their snapshots are kept until you delete them.` : `Every snapshot in “${this.binder.folder.name}” belongs to a note that’s there.` });
		for (const left of list) {
			const row = new Setting(contentEl).setName(left.path).setDesc(`${left.count} ${left.count === 1 ? 'snapshot' : 'snapshots'}`);
			row.addButton((b) => b.setButtonText('Show').onClick(() => new SnapshotsModal(this.plugin, left).open()));
			if (!ro) row.addButton((b) => b.setButtonText('Give to a note...').onClick(() => new ScenePicker(this.plugin, this.binder, (scene) => {
				void attach(this.plugin, left, scene).then(() => say(`“${scene.basename}” now has the ${left.count === 1 ? 'snapshot' : `${left.count} snapshots`} of “${left.path.slice(left.path.lastIndexOf('/') + 1)}”.`), tell);
			}).open()));
		}
	}
}

// ---- menus ----

const headers = new WeakMap<MarkdownView, HTMLElement>();
/** The header button on a binder's notes (and only those): its snapshots, as a menu under it. It stands to the right
    of focus mode's button (`beside`), whichever of the two was put there first. */
export function headerSnapshots(plugin: BindersPlugin, view: MarkdownView, beside: HTMLElement | null): void {
	let el = headers.get(view);
	const want = isScene(plugin, view.file);
	if (want && !el) {
		const button = el = view.addAction('history', 'Snapshots', () => {
			const f = view.file, r = button.getBoundingClientRect();
			if (!f) return;
			const menu = new Menu();
			snapshotItems(plugin, menu, [f]);
			menu.showAtPosition({ x: r.left, y: r.bottom + 4, width: r.width, overlap: true, left: false }, button.doc);
		});
		headers.set(view, el);
	} else if (!want && el) { el.remove(); headers.delete(view); el = undefined; }
	if (el && beside && beside.nextElementSibling !== el) beside.after(el);
}
/** Takes the header button off again (the plugin is being turned off). */
export function clearHeaderSnapshots(view: MarkdownView): void { headers.get(view)?.remove(); headers.delete(view); }

/** "Take a snapshot", "Rewrite..." and "Show snapshots..." for a menu: one scene, or (taking only) several. In a binder
    that can't be changed, only the reading. With `folded`, the three are one item, "Snapshots", that opens them (a
    card's own menu is long as it is: three more would run it off a tablet's screen). */
export function snapshotItems(plugin: BindersPlugin, menu: Menu, items: unknown[], section = 'snapshots', readOnly = false, folded = false): void {
	const scenes = items.filter((f): f is TFile => isScene(plugin, f));
	if (!scenes.length || scenes.length !== items.length) return;
	const one = scenes.length === 1 ? scenes[0] : null, ro = readOnly || !!plugin.binders.problem(scenes[0]);
	if (!one) { if (!ro) menu.addItem((i) => i.setSection(section).setTitle(`Take a snapshot of ${scenes.length} notes`).setIcon('camera').onClick(() => void take(plugin, scenes))); return; }
	const show = () => new SnapshotsModal(plugin, one).open();
	if (ro) { menu.addItem((i) => i.setSection(section).setTitle('Show snapshots...').setIcon('history').onClick(show)); return; }
	const three = (m: Menu, sec: string | null) => {
		m.addItem((i) => { if (sec) i.setSection(sec); i.setTitle('Take a snapshot').setIcon('camera').onClick(() => void take(plugin, [one])); });
		m.addItem((i) => { if (sec) i.setSection(sec); i.setTitle('Rewrite...').setIcon('file-pen-line').onClick(() => startRewrite(plugin, one)); });
		m.addItem((i) => { if (sec) i.setSection(sec); i.setTitle('Show snapshots...').setIcon('history').onClick(show); });
	};
	if (folded) menu.addItem((i) => { i.setSection(section).setTitle('Snapshots').setIcon('history'); submenu(i, (m) => three(m, null), menu); });
	else three(menu, section);
}

/** For a folder of a binder (or the binder): its own two items, "Take a snapshot" and "Show snapshots..."; and for
    the binder itself, the snapshots of notes that are gone, when there are any. */
export function folderSnapshotItems(plugin: BindersPlugin, menu: Menu, folder: TFolder, section = 'snapshots', readOnly = false): void {
	const store = plugin.binders, b = store.binderOf(folder);
	if (!b || store.inSnapshots(folder.path)) return;
	folderItems(plugin, menu, folder, section, readOnly || !!b.problem);
	if (folder === b.folder && leftovers(plugin, b).length) menu.addItem((i) => i.setSection(section).setTitle('Snapshots of notes that are gone...').setIcon('history').onClick(() => new LeftoversModal(plugin, b).open()));
}
