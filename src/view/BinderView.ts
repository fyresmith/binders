import { ItemView, Keymap, Menu, Scope, type Events, TFile, TFolder, setIcon, type PaneType, type TAbstractFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { commitAll, commitFocused, editable, type Editable } from './edit';
import { readableLineLength, refreshHeader } from './internals';
import { display, labelDot } from './labels';
import type { BinderMode, ModeContext, ModeFactory, SceneProps } from './mode';
import { WordCounter, wordsLabel } from './words';

/* The binder view: one folder of a binder, shown as a corkboard, a plot grid or a manuscript. The view owns the toolbar
   (breadcrumb, word count, filter, mode), the folder's synopsis and the subscriptions; the mode draws the rest (mode.ts).
   Its state (folder, mode, filter, the modes' options) lives in the workspace, so it comes back after a reload. */

export const VIEW_TYPE = 'binders-view';

export type ModeName = 'corkboard' | 'plotgrid' | 'manuscript';
export const MODES: readonly { id: ModeName; name: string; icon: string }[] = [
	{ id: 'corkboard', name: 'Corkboard', icon: 'layout-grid' },
	{ id: 'plotgrid', name: 'Plot grid', icon: 'table' },
	{ id: 'manuscript', name: 'Manuscript', icon: 'scroll-text' },
];
const isMode = (m: unknown): m is ModeName => MODES.some((x) => x.id === m);

interface Filter { status: string[]; label: string[] }
interface BinderViewState { folder?: string; mode?: ModeName; filter?: Filter; options?: Record<string, unknown> }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '');

/** Folders renamed or moved since Obsidian started, old path to new, so a tab's history (Back) still finds them. */
const moved = new Map<string, string>();
function followMoves(path: string): string {
	for (let i = 0; i < 32; i++) {
		const hit = [...moved].find(([from]) => path === from || path.startsWith(from + '/'));
		if (!hit) break;
		path = hit[1] + path.slice(hit[0].length);
	}
	return path;
}

/** A mode that isn't built yet: an empty state, like Obsidian's own. */
const comingSoon = (name: string): ModeFactory => (el) => ({
	render() {
		const box = el.createDiv({ cls: 'binders-empty' });
		box.createDiv({ cls: 'binders-empty-title', text: `${name} is coming soon` });
		box.createDiv({ cls: 'binders-empty-text', text: 'Switch to the corkboard to see this folder.' });
	},
	refresh() { /* nothing to update */ },
	unload() { el.empty(); },
});

export class BinderView extends ItemView {
	navigation = true;
	/** The folder shown, and its path (kept when the folder isn't there, e.g. before binders are found at startup). */
	folder: TFolder | null = null;
	private path = '';
	mode: ModeName = 'corkboard';
	private filter: Filter = { status: [], label: [] };
	private options: Record<string, unknown> = {};
	private binder: Binder | null = null;
	private current: BinderMode | null = null;
	private words: WordCounter;
	private identity = '';
	private timer = 0;
	private reveal: string | null = null;
	/** Binders have been looked for with the metadata cache complete (until then, a folder not found yet may still be
	    found: the view says it's loading, not that the folder isn't in a binder). */
	private found = false;
	private synopsis: Editable | null = null;
	private relaying = false;
	private ui: { crumbs: HTMLElement; count: HTMLElement; filter: HTMLElement; modeBtn: HTMLElement; notice: HTMLElement; synopsis: HTMLElement; body: HTMLElement } | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: BindersPlugin) {
		super(leaf);
		this.words = new WordCounter(this.app, () => this.schedule());
		// Mod-Enter saves a synopsis. Obsidian's own Mod-Enter ("Open link in new tab") would otherwise take it when an
		// editor was active last.
		this.scope = new Scope(this.app.scope);
		this.scope.register(['Mod'], 'Enter', () => !commitFocused());
		// F2 renames the focused card or plotline, as it renames the focused item in the file explorer. Obsidian's own F2
		// ("Rename file") would otherwise take it before the view sees it: pass it on to what has the focus.
		this.scope.register([], 'F2', () => {
			const el = this.contentEl.doc.activeElement;
			if (this.relaying || !el?.instanceOf(HTMLElement) || !this.contentEl.contains(el) || el.matches('input, textarea, [contenteditable="true"], .cm-content')) return true;
			this.relaying = true;
			try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true, cancelable: true })); } finally { this.relaying = false; }
			return false;
		});
	}

	getViewType(): string { return VIEW_TYPE; }
	getIcon(): string { return 'book'; }
	getDisplayText(): string { return this.folder?.name ?? (this.path.split('/').pop() || 'Binder'); }

	get store() { return this.plugin.binders; }
	get readOnly(): boolean { return !!this.binder?.problem; }

	getState(): Record<string, unknown> {
		return { ...super.getState(), folder: this.folder?.path ?? this.path, mode: this.mode, filter: this.filter, options: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = (state ?? {}) as BinderViewState;
		// another folder is a step in the tab's history, so Back returns to this one
		if (typeof s.folder === 'string' && s.folder !== this.path) { if (this.path) result.history = true; this.path = s.folder; }
		if (isMode(s.mode)) this.mode = s.mode;
		if (s.filter && typeof s.filter === 'object') this.filter = { status: strings(s.filter.status), label: strings(s.filter.label) };
		if (s.options && typeof s.options === 'object') this.options = { ...s.options };
		await super.setState(state, result);
		this.rebuild();
		// binders are found once the layout is ready, and for sure once the metadata cache is complete; a view restored
		// before that shows it's loading, and draws again then (never awaited here: the layout waits for this)
		void this.store.settled.then(() => {
			this.found = true;
			if (!this.folder) this.rebuild(); else this.schedule();
		});
	}

	setEphemeralState(state: unknown): void {
		const r = (state as { reveal?: unknown } | null)?.reveal;
		if (typeof r === 'string') { this.reveal = r; this.applyReveal(); }
		super.setEphemeralState(state);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('binders-view');
		// the manuscript's page follows the editor's "Readable line length", as a note does
		const readable = () => this.contentEl.toggleClass('is-readable-line-width', readableLineLength(this.app));
		readable();
		this.registerEvent((this.app.vault as Events).on('config-changed', readable));
		const { vault, metadataCache } = this.app;
		const ref = this.store.on('changed', (p: string) => {
			const f = this.folder?.path ?? this.path;
			if (!p || !this.binder || f === p || f.startsWith(p + '/')) this.schedule();
		});
		this.register(() => this.store.offref(ref));
		this.registerEvent(metadataCache.on('changed', (file) => {
			const f = this.folder;
			if (f && (file.path.startsWith(f.path + '/') || file === this.binder?.note)) this.schedule();
		}));
		this.registerEvent(vault.on('rename', (file, old) => {
			if (file instanceof TFolder) { moved.delete(file.path); moved.set(old, file.path); }
			if (!this.folder || !(file instanceof TFolder) || (file !== this.folder && !this.folder.path.startsWith(file.path + '/'))) return;
			this.path = this.folder.path;
			refreshHeader(this);
			this.app.workspace.requestSaveLayout();
			this.schedule();
		}));
	}

	async onClose(): Promise<void> {
		await commitAll(this.contentEl);
		window.clearTimeout(this.timer);
		this.current?.unload();
		this.current = null;
	}

	onPaneMenu(menu: Menu, source: string): void {
		if (source === 'more-options' && this.folder) {
			for (const m of MODES) menu.addItem((i) => i.setSection('view').setTitle(m.name).setIcon(m.icon).setChecked(this.mode === m.id).onClick(() => this.setMode(m.id)));
			this.current?.menu?.(menu);
			const note = this.store.folderNote(this.folder);
			if (note) menu.addItem((i) => i.setSection('open').setTitle('Open folder note').setIcon('file-text').onClick((e) => void this.app.workspace.getLeaf(Keymap.isModEvent(e)).openFile(note)));
		}
		super.onPaneMenu(menu, source);
	}

	/** Switches the view to another mode (the "Show corkboard" commands, the mode menu). */
	setMode(mode: ModeName): void {
		if (mode === this.mode) return;
		this.mode = mode;
		this.rebuild();
		this.app.workspace.requestSaveLayout();
	}

	/** Shows another folder, recorded in the tab's history so Back returns. */
	async navigate(folder: TFolder, newLeaf?: boolean | PaneType): Promise<void> {
		if (newLeaf) { await this.plugin.openBinder(folder, newLeaf); return; }
		await this.leaf.setViewState({ type: VIEW_TYPE, state: { ...this.getState(), folder: folder.path }, active: true });
	}

	// ---- drawing ----

	/** Changes throttled to one redraw per frame or so: typing in a note changes its word count often. */
	private schedule(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => { this.timer = 0; this.refresh(); }, 80);
	}

	private resolve(): void {
		let f = this.app.vault.getAbstractFileByPath(this.path);
		// a folder renamed since this view was on it (Back to it, after a rename)
		if (!(f instanceof TFolder)) {
			const to = followMoves(this.path), g = to !== this.path ? this.app.vault.getAbstractFileByPath(to) : null;
			if (g instanceof TFolder) { f = g; this.path = to; }
		}
		this.folder = f instanceof TFolder ? f : null;
		this.binder = this.folder ? this.store.binderOf(this.folder) : null;
		if (!this.binder) this.folder = null;
	}

	/** What the whole view depends on: when it changes, the mode is made again. */
	private key(): string { return JSON.stringify([this.folder?.path, this.binder?.note.path, this.binder?.problem, this.mode]); }

	private rebuild(): void {
		void commitAll(this.contentEl);
		this.current?.unload();
		this.current = null;
		this.synopsis = null;
		this.resolve();
		this.identity = this.key();
		const el = this.contentEl;
		el.empty();
		this.ui = null;
		refreshHeader(this);
		if (!this.folder) {
			const box = el.createDiv({ cls: 'binders-empty' });
			if (!this.found) {
				// quiet, and only after a moment (CSS), so a quick start shows nothing at all
				box.addClass('is-loading');
				box.createDiv({ cls: 'binders-empty-text', text: 'Loading…', attr: { role: 'status' } });
				return;
			}
			box.createDiv({ cls: 'binders-empty-title', text: 'This folder isn’t in a binder' });
			box.createDiv({ cls: 'binders-empty-text', text: this.path ? `“${this.path}” was moved or deleted, or is no longer part of a binder.` : 'Open a binder from the file explorer.' });
			return;
		}
		const bar = el.createDiv({ cls: 'binders-toolbar' });
		const crumbs = bar.createEl('nav', { cls: 'binders-breadcrumbs', attr: { 'aria-label': 'Folders' } });
		bar.createDiv({ cls: 'binders-toolbar-spacer' });
		const count = bar.createDiv({ cls: 'binders-word-count' });
		const filter = this.button(bar, 'filter', 'Filter', 'binders-filter-button', (e) => this.filterMenu(e));
		const modeBtn = this.button(bar, 'layout-grid', 'Corkboard', 'binders-mode-button', (e) => this.modeMenu(e));
		for (const b of [filter, modeBtn]) b.setAttr('aria-haspopup', 'menu');
		setIcon(modeBtn.createDiv({ cls: 'text-button-icon mod-aux' }), 'chevron-down');
		const notice = el.createDiv({ cls: 'binders-notice' });
		const synopsis = el.createDiv({ cls: 'binders-view-synopsis-row' });
		const body = el.createDiv({ cls: `binders-mode binders-mode-${this.mode}` });
		this.ui = { crumbs, count, filter, modeBtn, notice, synopsis, body };
		this.drawToolbar();
		const factory = this.plugin.modeFactories[this.mode] ?? comingSoon(MODES.find((m) => m.id === this.mode)?.name ?? 'This view');
		this.current = factory(body, this.context());
		this.current.render();
		filter.toggleClass('is-hidden', !this.current.filters);
		this.applyReveal();
	}

	private refresh(): void {
		this.resolve();
		if (this.key() !== this.identity) { this.rebuild(); return; }
		if (!this.folder) return;
		this.drawToolbar();
		this.current?.refresh();
	}

	private button(parent: HTMLElement, icon: string, label: string, cls: string, onClick: (e: MouseEvent) => void): HTMLElement {
		const b = parent.createDiv({ cls: ['text-icon-button', 'binders-toolbar-button', cls], attr: { role: 'button', tabindex: '0', 'aria-label': label } });
		setIcon(b.createSpan({ cls: 'text-button-icon' }), icon);
		b.createSpan({ cls: 'text-button-label', text: label });
		b.addEventListener('click', onClick);
		b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
		return b;
	}

	private drawToolbar(): void {
		const ui = this.ui, folder = this.folder, binder = this.binder;
		if (!ui || !folder || !binder) return;
		// breadcrumb: the binder, then each folder down to this one
		ui.crumbs.empty();
		const chain: TFolder[] = [];
		for (let f: TFolder | null = folder; f; f = f === binder.folder ? null : f.parent) chain.unshift(f);
		chain.forEach((f, i) => {
			if (i) setIcon(ui.crumbs.createSpan({ cls: 'binders-crumb-sep', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
			const last = i === chain.length - 1;
			const c = ui.crumbs.createSpan({ cls: 'binders-crumb' + (last ? ' is-current' : ''), text: f.name });
			if (last) { c.setAttr('aria-current', 'page'); return; }
			c.setAttrs({ role: 'link', tabindex: '0' });
			c.addEventListener('click', (e) => void this.navigate(f, Keymap.isModEvent(e)));
			c.addEventListener('auxclick', (e) => { if (e.button === 1) void this.navigate(f, 'tab'); });
			c.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.navigate(f, Keymap.isModEvent(e)); });
		});
		// word count, with the binder's target on the binder itself
		const n = this.words.sum(this.store.scenes(folder));
		const target = Number(this.app.metadataCache.getFileCache(binder.note)?.frontmatter?.target);
		if (n != null) {
			const goal = folder === binder.folder && target > 0 ? target : 0;
			ui.count.setText(goal ? `${n.toLocaleString()} / ${wordsLabel(goal)}` : wordsLabel(n));
			ui.count.setAttr('aria-label', goal ? `${Math.floor((n / goal) * 100)}% of the binder’s target` : 'Words in this folder');
			ui.count.toggleClass('is-complete', !!goal && n >= goal);
		}
		// the filter, when on, says how many values it keeps; only for modes that filter
		ui.filter.toggleClass('is-hidden', !this.current?.filters);
		const on = this.filter.status.length + this.filter.label.length;
		ui.filter.toggleClass('is-active', on > 0);
		ui.filter.querySelector('.text-button-label')?.setText(on ? `Filter (${on})` : 'Filter');
		const mode = MODES.find((m) => m.id === this.mode);
		setIcon(ui.modeBtn.querySelector<HTMLElement>('.text-button-icon'), mode.icon);
		ui.modeBtn.querySelector('.text-button-label')?.setText(mode.name);
		ui.modeBtn.setAttr('aria-label', `View as: ${mode.name}`);
		// a newer-format binder: say why nothing can change
		ui.notice.empty();
		ui.notice.toggleClass('is-shown', this.readOnly);
		if (this.readOnly) {
			setIcon(ui.notice.createSpan({ cls: 'binders-notice-icon' }), 'lock');
			ui.notice.createSpan({ text: `Read only. ${binder.problem}` });
		}
		this.drawSynopsis();
	}

	/** The folder's own synopsis (its folder note, or the binder note), edited in place. */
	private drawSynopsis(): void {
		const ui = this.ui, folder = this.folder;
		if (!ui || !folder || this.synopsis?.editing) return;
		const note = this.store.folderNote(folder);
		const value = note ? this.props(note).synopsis : '';
		ui.synopsis.empty();
		ui.synopsis.toggleClass('is-hidden', this.readOnly && !value);
		this.synopsis = editable(ui.synopsis, {
			cls: 'binders-view-synopsis', value, placeholder: 'Add a synopsis', label: `Synopsis of ${folder.name}`, readOnly: this.readOnly, focusable: true,
			save: async (t) => { const f = await this.store.ensureFolderNote(folder); await this.setProps(f, { synopsis: t }); },
			onEditing: (on) => { if (!on) this.schedule(); },
		});
	}

	private applyReveal(): void {
		if (!this.reveal || !this.current) return;
		const f = this.app.vault.getAbstractFileByPath(this.reveal);
		this.reveal = null;
		if (f) this.current.reveal?.(f);
	}

	// ---- menus ----

	private modeMenu(e: MouseEvent): void {
		const menu = new Menu();
		for (const m of MODES) menu.addItem((i) => i.setTitle(m.name).setIcon(m.icon).setChecked(this.mode === m.id).onClick(() => this.setMode(m.id)));
		this.showBelow(menu, e);
	}

	private filterMenu(e: MouseEvent): void {
		const scenes = this.folder ? this.store.scenes(this.folder) : [];
		const statuses = new Set<string>(), labels = new Set<string>();
		let noStatus = false, noLabel = false;
		for (const f of scenes) {
			const p = this.props(f);
			if (p.status) statuses.add(p.status); else noStatus = true;
			if (p.label) labels.add(p.label); else noLabel = true;
		}
		const menu = new Menu();
		const toggle = (kind: keyof Filter, v: string) => {
			const list = this.filter[kind];
			this.setFilter({ ...this.filter, [kind]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
		};
		const group = (kind: keyof Filter, title: string, values: Set<string>, none: boolean, noneTitle: string) => {
			if (!values.size) return;
			menu.addItem((i) => i.setSection(kind).setTitle(title).setIsLabel(true));
			for (const v of values) {
				menu.addItem((i) => {
					const t = createFragment();
					// a status shows as it's written, as on the cards; a label by its color's name
					if (kind === 'label') { labelDot(t, v); t.appendText(display(v)); } else t.appendText(v);
					i.setSection(kind).setTitle(t).setChecked(this.filter[kind].includes(v)).onClick(() => toggle(kind, v));
				});
			}
			if (none) menu.addItem((i) => i.setSection(kind).setTitle(noneTitle).setChecked(this.filter[kind].includes('')).onClick(() => toggle(kind, '')));
		};
		group('status', 'Status', statuses, noStatus, 'No status');
		group('label', 'Label', labels, noLabel, 'No label');
		if (!statuses.size && !labels.size) menu.addItem((i) => i.setTitle('No statuses or labels to filter by').setIsLabel(true));
		if (this.filter.status.length || this.filter.label.length) {
			menu.addItem((i) => i.setSection('clear').setTitle('Clear filter').setIcon('x').onClick(() => this.setFilter({ status: [], label: [] })));
		}
		this.showBelow(menu, e);
	}

	private setFilter(filter: Filter): void {
		this.filter = filter;
		this.app.workspace.requestSaveLayout();
		this.drawToolbar();
		this.current?.filterChanged?.();
		this.current?.refresh();
	}

	private showBelow(menu: Menu, e: MouseEvent): void {
		const t = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
		if (!t) { menu.showAtMouseEvent(e); return; }
		const r = t.getBoundingClientRect();
		menu.showAtPosition({ x: r.left, y: r.bottom + 4, width: r.width, overlap: true, left: false }, t.doc);
	}

	// ---- the modes' context ----

	props(file: TFile): SceneProps {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const s = this.plugin.settings;
		const lines = fm[s.plotlinesProp] as unknown;
		return {
			synopsis: text(fm[s.synopsisProp]),
			status: text(fm[s.statusProp]).trim(),
			label: text(fm[s.labelProp]).trim(),
			plotlines: typeof lines === 'string' ? [lines] : strings(lines),
		};
	}

	async setProps(file: TFile, patch: Partial<SceneProps>): Promise<void> {
		if (this.readOnly) throw new Error('This binder is read only.');
		const s = this.plugin.settings;
		const names: Record<keyof SceneProps, string> = { synopsis: s.synopsisProp, status: s.statusProp, label: s.labelProp, plotlines: s.plotlinesProp };
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(patch) as [keyof SceneProps, unknown][]) {
			out[names[k]] = v === '' || (Array.isArray(v) && !v.length) ? undefined : v;
		}
		await this.store.setProps(file, out);
	}

	private visible(file: TFile): boolean {
		const { status, label } = this.filter;
		if (!status.length && !label.length) return true;
		const p = this.props(file);
		return (!status.length || status.includes(p.status)) && (!label.length || label.includes(p.label));
	}

	private context(): ModeContext {
		return {
			app: this.app, plugin: this.plugin, store: this.store, binder: this.binder, folder: this.folder, owner: this,
			readOnly: this.readOnly,
			props: (f) => this.props(f),
			setProps: (f, p) => this.setProps(f, p),
			openFile: async (f, newLeaf) => { await this.app.workspace.getLeaf(newLeaf || false).openFile(f); },
			navigate: (f, newLeaf) => void this.navigate(f, newLeaf),
			words: (f) => this.words.get(f),
			// typing in the manuscript: the counts follow as you type, before the note is saved
			onTextChange: (f, t) => { this.words.typed(f, t); this.schedule(); },
			visible: (f) => this.visible(f),
			option: <T>(key: string, fallback: T): T => (key in this.options ? this.options[key] : fallback) as T,
			setOption: (key, value) => { this.options = { ...this.options, [key]: value }; this.app.workspace.requestSaveLayout(); },
		};
	}

	/** For "Open binder" on a note: the card to select once the view is drawn. */
	revealItem(item: TAbstractFile): void { this.reveal = item.path; this.applyReveal(); }
}
