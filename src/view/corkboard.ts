import { Keymap, Menu, Notice, Platform, TFile, TFolder, normalizePath, setIcon, type PaneType, type TAbstractFile } from 'obsidian';
import { editable, type Editable } from './edit';
import { submenu } from './internals';
import { display, LABEL_COLORS, labelColor, labelDot } from './labels';
import { ask, confirm } from './modals';
import type { BinderMode, ModeContext, ModeFactory } from './mode';
import { wordsLabel } from './words';

/* The corkboard: one index card per note, in binder order. Subfolders show as groups with a heading (or, as an option,
   as one stacked card each); in a Longform project, which has no subfolders, scenes indented under a scene do. Cards are edited in place (synopsis, title), reordered by dragging (mouse, pen or touch:
   touch starts a drag with a long press, so a swipe still scrolls) or with the keyboard, and moved between folders by
   dropping them in another group. Redraws wait while something is being typed or dragged, so neither is interrupted. */

interface Group {
	folder: TFolder;
	/** A subfolder of the one shown (with a heading), or a run of the shown folder's own notes. */
	sub: boolean;
	items: TAbstractFile[];
	/** The folder's item just after this group, where its end is (null: the folder's end). */
	end: TAbstractFile | null;
	/** Longform: the indent of the group's scenes (a drop or a new card there gets it), and the scene they're indented
	    under (the heading; null for none, or for a group that continues one shown above). */
	depth?: number;
	head?: TFile | null;
}

interface Drop { group: Group; anchor: TAbstractFile | null }

const isNote = (f: TAbstractFile): f is TFile => f instanceof TFile && f.extension === 'md';
const LONG_PRESS = 450;
/** Why a typed name can't be a file's name, or null: characters Obsidian refuses or that break links, and a leading dot,
    which makes a hidden file Obsidian doesn't show. */
const badName = (name: string): string | null =>
	/[\\/:]/.test(name) ? 'A name can’t contain \\ / or :' : name.startsWith('.') ? 'A name can’t start with a dot.' : null;

export const corkboard: ModeFactory = (container, ctx) => new Corkboard(container, ctx);

class Corkboard implements BinderMode {
	readonly filters = true;
	private board: HTMLElement;
	private groups: Group[] = [];
	private sig = '';
	/** Selected items by path; `anchor` is where a Shift-click range starts, `focused` the card with the focus. */
	private sel = new Set<string>();
	private anchor: string | null = null;
	private focused: string | null = null;
	private editing = 0;
	private dirty = false;
	private newIn: string | null = null;
	private press: { id: number; x: number; y: number; touch: boolean; card: HTMLElement; armed: boolean; timer: number } | null = null;
	private drag: { items: TAbstractFile[]; ghost: HTMLElement; indicator: HTMLElement; drop: Drop | null; x: number; y: number; raf: number } | null = null;
	private lastPointer = 'mouse';
	private noClick = false;
	private swallowTouch = false;
	private cleanup: (() => void)[] = [];

	constructor(private container: HTMLElement, private ctx: ModeContext) {}

	private get store() { return this.ctx.store; }
	private get stacks(): boolean { return this.ctx.option('stacks', false); }
	private get longform(): boolean { return this.ctx.binder.kind === 'longform'; }

	render(): void {
		this.container.addClass('binders-corkboard');
		this.board = this.container.createDiv({ cls: 'binders-board' });
		const b = this.board, on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
			b.addEventListener(t, fn, opts);
			this.cleanup.push(() => b.removeEventListener(t, fn, opts));
		};
		on('pointerdown', (e) => this.onPointerDown(e));
		on('click', (e) => this.onClick(e));
		on('dblclick', (e) => this.onDblClick(e));
		on('contextmenu', (e) => this.onContextMenu(e));
		on('keydown', (e) => this.onKey(e));
		// while a card is held or dragged by touch, the page mustn't scroll instead
		on('touchmove', (e) => { if (this.press?.armed || this.drag) e.preventDefault(); }, { passive: false });
		// and lifting the finger after a long press or a drag mustn't click (which would also close the menu just opened)
		on('touchend', (e) => { if (this.swallowTouch) { this.swallowTouch = false; e.preventDefault(); } }, { passive: false });
		this.draw();
	}

	refresh(): void {
		if (this.busy()) { this.dirty = true; return; }
		if (this.signature() !== this.sig) this.draw();
	}

	unload(): void {
		this.endDrag(false);
		this.endPress();
		for (const f of this.cleanup) f();
		this.cleanup = [];
		this.container.empty();
		this.container.removeClass('binders-corkboard');
	}

	focus(): void { this.cardEl(this.focused)?.focus() ?? this.cards()[0]?.focus(); }

	reveal(item: TAbstractFile): void {
		const el = this.cardEl(item.path);
		if (!el) return;
		this.select([item.path], item.path);
		el.scrollIntoView({ block: 'nearest' });
		el.focus({ preventScroll: true });
	}

	menu(menu: Menu): void {
		if (this.longform) return; // no subfolders to stack
		menu.addItem((i) => i.setSection('view').setTitle('Show subfolders as stacks').setIcon('layers').setChecked(this.stacks).onClick(() => {
			this.ctx.setOption('stacks', !this.stacks);
			this.draw();
		}));
	}

	// ---- the model ----

	private children(folder: TFolder): TAbstractFile[] {
		return (this.store.orderedChildren(folder) ?? []).filter((f) => f instanceof TFolder || isNote(f));
	}

	private model(): Group[] {
		const top = this.ctx.folder;
		if (this.longform) {
			// one flat folder: the groups are runs of scenes by indent, from the store
			const groups = this.store.groups(top), flat = groups.flatMap((g) => g.files), out: Group[] = [];
			let n = 0;
			for (const g of groups) { n += g.files.length; out.push({ folder: top, sub: false, items: g.files, end: flat[n] ?? null, depth: g.depth, head: g.continued ? null : g.head }); }
			if (!out.length || out[out.length - 1].depth) out.push({ folder: top, sub: false, items: [], end: null, depth: 0, head: null });
			return out;
		}
		const list = this.children(top);
		if (this.stacks) return [{ folder: top, sub: false, items: list, end: null }];
		const out: Group[] = [];
		let run: TAbstractFile[] = [];
		const flush = (end: TAbstractFile | null) => { if (run.length) out.push({ folder: top, sub: false, items: run, end }); run = []; };
		for (const f of list) {
			if (f instanceof TFolder) { flush(f); out.push({ folder: f, sub: true, items: this.children(f), end: null }); }
			else run.push(f);
		}
		// a last group for new notes at the end of this folder, after its subfolders
		if (run.length || !out.length || out[out.length - 1].sub) out.push({ folder: top, sub: false, items: run, end: null });
		return out;
	}

	private shown(g: Group): TAbstractFile[] { return g.items.filter((f) => !(f instanceof TFile) || this.ctx.visible(f)); }

	/** Where an item's card data lives: the note itself, or a folder's folder note (null until it has one). */
	private noteOf(f: TAbstractFile): TFile | null { return f instanceof TFolder ? this.store.folderNote(f) : f instanceof TFile ? f : null; }

	/** Everything a redraw would show, so a refresh that changes nothing visible draws nothing. */
	private signature(): string {
		const card = (f: TAbstractFile) => {
			if (f instanceof TFolder) {
				const note = this.store.folderNote(f), p = note ? this.ctx.props(note) : null, scenes = this.store.scenes(f);
				return [f.path, 'folder', p?.synopsis, p?.status, p?.label, scenes.length, this.sum(scenes)];
			}
			if (!(f instanceof TFile)) return [f.path];
			const p = this.ctx.props(f);
			return [f.path, p.synopsis, p.status, p.label, this.ctx.words(f)];
		};
		const groups = this.model();
		return JSON.stringify([this.ctx.readOnly, this.stacks, groups.map((g) => {
			const note = g.sub ? this.store.folderNote(g.folder) : null, p = note ? this.ctx.props(note) : null;
			return [g.folder.path, g.sub, g.end?.path, g.depth, g.head?.path, p?.synopsis, p?.status, p?.label, g.sub ? this.sum(this.store.scenes(g.folder)) : 0, this.shown(g).map(card)];
		})]);
	}

	private sum(files: TFile[]): number | null {
		let n = 0;
		for (const f of files) { const w = this.ctx.words(f); if (w == null) return null; n += w; }
		return n;
	}

	// ---- drawing ----

	private busy(): boolean { return this.editing > 0 || !!this.drag || !!this.newIn; }

	private draw(): void {
		const scroller = this.scroller(), top = scroller.scrollTop;
		const hadFocus = this.board.contains(this.board.doc.activeElement);
		this.dirty = false;
		this.groups = this.model();
		this.sig = this.signature();
		this.board.empty();
		this.editors.clear();
		this.board.toggleClass('is-read-only', this.ctx.readOnly);
		this.groups.forEach((g, gi) => this.drawGroup(g, gi));
		// keep only what still exists selected
		const paths = new Set(this.cards().map((c) => c.dataset.path));
		for (const p of [...this.sel]) if (!paths.has(p)) this.sel.delete(p);
		if (this.focused && !paths.has(this.focused)) this.focused = null;
		this.paintSelection();
		scroller.scrollTop = top;
		if (hadFocus) this.cardEl(this.focused)?.focus({ preventScroll: true });
	}

	private drawGroup(g: Group, gi: number): void {
		const sec = this.board.createDiv({ cls: 'binders-group' + (g.sub ? ' is-folder' : '') + (g.depth ? ' is-indented' : ''), attr: { 'data-group': String(gi) } });
		if (g.depth) sec.setCssProps({ '--binders-group-depth': String(g.depth) });
		if (g.sub) this.drawHeading(sec, g.folder);
		else if (g.head) this.drawSceneHeading(sec, g.head, g.items);
		const list = sec.createDiv({ cls: 'binders-cards', attr: { role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': g.folder.name } });
		for (const f of this.shown(g)) this.drawCard(list, f);
		if (!this.ctx.readOnly) this.drawNewCard(list, g);
	}

	private drawHeading(parent: HTMLElement, folder: TFolder): void {
		const h = parent.createDiv({ cls: 'binders-group-heading' });
		const row = h.createDiv({ cls: 'binders-group-title-row' });
		const note = this.store.folderNote(folder), p = note ? this.ctx.props(note) : null;
		const title = row.createDiv({ cls: 'binders-group-title', attr: { role: 'link', tabindex: '0', 'aria-label': `Show ${folder.name}` } });
		setIcon(title.createSpan({ cls: 'binders-group-icon' }), 'folder');
		title.createSpan({ text: folder.name });
		title.addEventListener('click', (e) => this.ctx.navigate(folder, Keymap.isModEvent(e)));
		title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); this.ctx.navigate(folder, Keymap.isModEvent(e)); } });
		if (p?.label) labelDot(row, p.label).setAttr('aria-label', `Label: ${p.label}`);
		if (p?.status) row.createSpan({ cls: 'binders-chip', text: p.status });
		const scenes = this.store.scenes(folder), n = this.sum(scenes);
		row.createSpan({ cls: 'binders-group-count', text: `${scenes.length} ${scenes.length === 1 ? 'note' : 'notes'}${n == null ? '' : ' · ' + wordsLabel(n)}` });
		row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.folderMenu(folder, null).showAtMouseEvent(e); });
		this.synopsis(h, folder, 'binders-group-synopsis', undefined, true);
	}

	/** Longform: the heading of scenes indented under a scene. Clicking it selects that scene's card. */
	private drawSceneHeading(parent: HTMLElement, head: TFile, items: TAbstractFile[]): void {
		const row = parent.createDiv({ cls: 'binders-group-heading' }).createDiv({ cls: 'binders-group-title-row' });
		const title = row.createDiv({ cls: 'binders-group-title', attr: { role: 'link', tabindex: '0', 'aria-label': `Go to ${head.basename}` } });
		setIcon(title.createSpan({ cls: 'binders-group-icon' }), 'corner-down-right');
		title.createSpan({ text: head.basename });
		const go = () => this.reveal(head);
		title.addEventListener('click', go);
		title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); go(); } });
		const scenes = items.filter(isNote), n = this.sum(scenes);
		row.createSpan({ cls: 'binders-group-count', text: `${scenes.length} ${scenes.length === 1 ? 'note' : 'notes'}${n == null ? '' : ' · ' + wordsLabel(n)}` });
	}

	/** A folder's synopsis, kept in its folder note (made the first time one is written). */
	private synopsis(parent: HTMLElement, item: TAbstractFile, cls: string, card?: HTMLElement, focusable = false): Editable {
		const note = this.noteOf(item);
		return editable(parent, {
			cls, value: note ? this.ctx.props(note).synopsis : '', placeholder: 'Add a synopsis', label: 'Edit the synopsis', readOnly: this.ctx.readOnly, focusable,
			// a tap only edits a card that's already selected, so tapping a card first selects it
			shouldEdit: () => !card || this.lastPointer !== 'touch' || this.sel.has(card.dataset.path),
			save: async (t) => {
				const f = item instanceof TFolder ? await this.store.ensureFolderNote(item) : note;
				await this.ctx.setProps(f, { synopsis: t });
			},
			onEditing: (on) => this.onEditing(on),
		});
	}

	private onEditing(on: boolean): void {
		this.editing += on ? 1 : -1;
		if (!on && !this.busy()) window.setTimeout(() => { if (!this.busy() && (this.dirty || this.signature() !== this.sig)) this.draw(); }, 0);
	}

	private drawCard(list: HTMLElement, f: TAbstractFile): void {
		const folder = f instanceof TFolder;
		const note = this.noteOf(f);
		const p = note ? this.ctx.props(note) : { synopsis: '', status: '', label: '', plotlines: [] };
		const name = f instanceof TFile ? f.basename : f.name;
		const card = list.createDiv({ cls: 'binders-card' + (folder ? ' is-stack' : ''), attr: { role: 'option', tabindex: '-1', 'data-path': f.path, 'aria-selected': 'false' } });
		const color = labelColor(p.label);
		if (color) { card.addClass(`mod-label-${color}`); card.dataset.label = p.label; }
		const head = card.createDiv({ cls: 'binders-card-head' });
		if (folder) setIcon(head.createSpan({ cls: 'binders-card-icon' }), 'folder');
		const title = editable(head, {
			cls: 'binders-card-title', value: name, placeholder: 'Title', label: 'Rename', singleLine: true, clickToEdit: false, readOnly: this.ctx.readOnly,
			save: (t) => this.rename(f, t), onEditing: (on) => this.onEditing(on),
		});
		card.setAttr('aria-label', name);
		this.editors.set(f.path, { title, synopsis: this.synopsis(card, f, 'binders-card-synopsis', card) });
		const foot = card.createDiv({ cls: 'binders-card-footer' });
		if (p.status) foot.createSpan({ cls: 'binders-chip', text: p.status });
		foot.createDiv({ cls: 'binders-card-spacer' });
		if (folder) {
			const scenes = this.store.scenes(f), n = this.sum(scenes);
			foot.createSpan({ cls: 'binders-card-words', text: `${scenes.length} ${scenes.length === 1 ? 'note' : 'notes'}${n == null ? '' : ' · ' + wordsLabel(n)}` });
		} else {
			const n = f instanceof TFile ? this.ctx.words(f) : null;
			if (n != null) foot.createSpan({ cls: 'binders-card-words', text: wordsLabel(n) });
		}
	}

	private drawNewCard(list: HTMLElement, g: Group): void {
		const key = `${g.folder.path}\n${g.end?.path ?? ''}`;
		const nc = list.createDiv({ cls: 'binders-card binders-card-new', attr: { role: 'button', tabindex: '0', 'aria-label': `New note in ${g.folder.name}`, 'data-new': key } });
		const idle = () => {
			nc.empty();
			setIcon(nc.createSpan({ cls: 'binders-card-new-icon' }), 'plus');
			nc.createSpan({ cls: 'binders-card-new-label', text: 'New note' });
		};
		idle();
		const start = () => {
			if (nc.querySelector('input')) return;
			nc.empty();
			nc.addClass('is-editing');
			this.newIn = key;
			const input = nc.createEl('input', { cls: 'binders-edit-field', attr: { type: 'text', placeholder: 'Title', 'aria-label': `Title of the new note in ${g.folder.name}`, enterkeyhint: 'done' } });
			let done = false;
			const finish = async (again: boolean) => {
				if (done) return;
				done = true;
				const t = input.value.trim();
				this.newIn = null;
				nc.removeClass('is-editing');
				if (!t) { idle(); if (this.dirty) this.draw(); return; }
				const bad = badName(t);
				if (bad) { new Notice(bad); done = false; this.newIn = key; nc.addClass('is-editing'); input.focus(); return; }
				try {
					const sibs = this.store.orderedChildren(g.folder) ?? [];
					const file = await this.store.newScene(g.folder, g.end ? Math.max(0, sibs.indexOf(g.end)) : Infinity, t, g.depth);
					this.select([file.path], file.path);
				} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
				this.draw();
				// Enter keeps the new card open for the next one; clicking away ends it
				if (again) (this.board.querySelector<HTMLElement>(`.binders-card-new[data-new="${CSS.escape(key)}"]`) as HTMLElement & { binderStart?: () => void })?.binderStart?.();
			};
			input.addEventListener('keydown', (e) => {
				e.stopPropagation();
				if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void finish(true); }
				else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; void finish(false); nc.focus(); }
			});
			input.addEventListener('blur', () => void finish(false));
			for (const t of ['click', 'dblclick', 'pointerdown', 'contextmenu'] as const) input.addEventListener(t, (e) => e.stopPropagation());
			input.focus();
		};
		(nc as HTMLElement & { binderStart?: () => void }).binderStart = start;
		nc.addEventListener('click', (e) => { e.stopPropagation(); start(); });
		nc.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === nc) { e.preventDefault(); e.stopPropagation(); start(); } });
	}

	// ---- selection ----

	private cards(): HTMLElement[] { return [...this.board.querySelectorAll<HTMLElement>('.binders-card[data-path]')]; }
	private cardEl(path: string | null): HTMLElement | null { return path ? this.cards().find((c) => c.dataset.path === path) ?? null : null; }
	private item(path: string): TAbstractFile | null { return this.ctx.app.vault.getAbstractFileByPath(path); }

	private select(paths: string[], focus: string | null = paths[paths.length - 1] ?? null, anchor = focus): void {
		this.sel = new Set(paths);
		this.focused = focus;
		this.anchor = anchor;
		this.paintSelection();
	}

	private paintSelection(): void {
		const cards = this.cards();
		const tab = this.cardEl(this.focused) ?? cards.find((c) => this.sel.has(c.dataset.path)) ?? cards[0];
		for (const c of cards) {
			const on = this.sel.has(c.dataset.path);
			c.toggleClass('is-selected', on);
			c.setAttr('aria-selected', String(on));
			c.setAttr('tabindex', c === tab ? '0' : '-1');
		}
	}

	/** The items an action applies to: the selection if the card is in it, else just the card. */
	private targets(card: HTMLElement): TAbstractFile[] {
		const paths = this.sel.has(card.dataset.path) ? this.cards().map((c) => c.dataset.path).filter((p) => this.sel.has(p)) : [card.dataset.path];
		return paths.map((p) => this.item(p)).filter((f): f is TAbstractFile => !!f);
	}

	private clickSelect(card: HTMLElement, e: MouseEvent | KeyboardEvent): void {
		const path = card.dataset.path;
		if (e.shiftKey && this.anchor) {
			const order = this.cards().map((c) => c.dataset.path);
			const a = order.indexOf(this.anchor), b = order.indexOf(path);
			if (a >= 0 && b >= 0) { const range = order.slice(Math.min(a, b), Math.max(a, b) + 1); this.select(Keymap.isModEvent(e) ? [...new Set([...this.sel, ...range])] : range, path, this.anchor); return; }
		}
		if (Keymap.isModEvent(e)) {
			const next = new Set(this.sel);
			if (next.has(path)) next.delete(path); else next.add(path);
			this.select([...next], path, path);
			return;
		}
		this.select([path]);
	}

	// ---- pointer: select, open, menu, drag ----

	private onClick(e: MouseEvent): void {
		if (this.noClick) { this.noClick = false; return; }
		const t = e.target as HTMLElement;
		const card = t.closest<HTMLElement>('.binders-card[data-path]');
		if (!card) {
			if (!t.closest('.binders-group-heading, .binders-card-new') && !e.shiftKey && !Keymap.isModEvent(e)) this.select([]);
			return;
		}
		// a tap on a note's title opens it, as a tap on a note in the file explorer does
		if (this.lastPointer === 'touch' && t.closest('.binders-card-head') && !t.closest('.is-editing')) {
			this.select([card.dataset.path]);
			this.open(card, false);
			return;
		}
		const editingNow = !!t.closest('.is-editing');
		this.clickSelect(card, e);
		if (!editingNow) card.focus({ preventScroll: true });
	}

	private onDblClick(e: MouseEvent): void {
		const card = (e.target as HTMLElement).closest<HTMLElement>('.binders-card[data-path]');
		if (!card || (e.target as HTMLElement).closest('.is-editing, .binders-card-synopsis.is-editable')) return;
		this.open(card, Keymap.isModEvent(e));
	}

	private open(card: HTMLElement, newLeaf: boolean | PaneType): void {
		const f = this.item(card.dataset.path);
		if (f instanceof TFolder) this.ctx.navigate(f, newLeaf);
		else if (f instanceof TFile) void this.ctx.openFile(f, newLeaf);
	}

	private onContextMenu(e: MouseEvent): void {
		const card = (e.target as HTMLElement).closest<HTMLElement>('.binders-card[data-path]');
		if (!card) return;
		e.preventDefault();
		// on touch, a long press opens the menu (and a long press and move drags), so the browser's own one is ignored
		if (this.lastPointer === 'touch') return;
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		this.cardMenu(card).showAtMouseEvent(e);
	}

	private onPointerDown(e: PointerEvent): void {
		this.lastPointer = e.pointerType;
		const t = e.target as HTMLElement;
		const card = t.closest<HTMLElement>('.binders-card[data-path]');
		if (!card || e.button !== 0 || t.closest('input, textarea') || this.drag) return;
		this.endPress();
		const touch = e.pointerType === 'touch';
		this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, touch, card, armed: false, timer: 0 };
		if (touch) {
			this.press.timer = window.setTimeout(() => {
				if (!this.press) return;
				this.press.armed = true;
				card.addClass('is-lifted');
			}, LONG_PRESS);
		} else if (!this.sel.has(card.dataset.path) && !e.shiftKey && !Keymap.isModEvent(e)) {
			this.select([card.dataset.path]); // so a drag right away drags this card
		}
		const doc = this.board.doc;
		const move = (ev: PointerEvent) => this.onPointerMove(ev);
		const up = (ev: PointerEvent) => this.onPointerUp(ev, false);
		const cancel = (ev: PointerEvent) => this.onPointerUp(ev, true);
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
		this.pressOff = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', cancel); };
	}

	private pressOff: (() => void) | null = null;

	private endPress(): void {
		if (this.press) { window.clearTimeout(this.press.timer); this.press.card.removeClass('is-lifted'); }
		this.press = null;
		this.pressOff?.();
		this.pressOff = null;
	}

	private onPointerMove(e: PointerEvent): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		if (this.drag) { this.dragTo(e.clientX, e.clientY); return; }
		const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
		if (p.touch && !p.armed) { if (d > 10) this.endPress(); return; } // a swipe: let it scroll
		if (d > (p.touch ? 6 : 5)) {
			if (this.ctx.readOnly) { this.endPress(); return; }
			this.startDrag(p.card, e.clientX, e.clientY);
		}
	}

	private onPointerUp(e: PointerEvent, cancelled: boolean): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		if (p.touch && (this.drag || p.armed)) {
			// the touchend that follows comes in the same task; never let the flag outlive it
			this.swallowTouch = true;
			window.setTimeout(() => { this.swallowTouch = false; }, 0);
		}
		if (this.drag) {
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
			this.endPress();
			// let go outside the board: nothing moves, as when a drag in the file explorer ends outside it
			const r = this.scroller().getBoundingClientRect();
			const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
			if (inside) this.dragTo(e.clientX, e.clientY);
			this.endDrag(!cancelled && inside);
			return;
		}
		if (p.touch && p.armed && !cancelled) {
			// held without moving: the menu
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
			const card = p.card;
			this.endPress();
			if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
			this.cardMenu(card).showAtPosition({ x: e.clientX, y: e.clientY }, this.board.doc);
			return;
		}
		this.endPress();
	}

	private startDrag(card: HTMLElement, x: number, y: number): void {
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		const items = this.targets(card);
		if (!items.length) return;
		const ghost = this.board.doc.body.createDiv({ cls: 'drag-ghost binders-drag-ghost' });
		const self = ghost.createDiv({ cls: 'drag-ghost-self' });
		setIcon(self, items.length > 1 ? 'files' : items[0] instanceof TFolder ? 'folder' : 'file');
		self.createSpan({ text: items.length > 1 ? `${items.length} items` : items[0] instanceof TFile ? items[0].basename : items[0].name });
		const indicator = this.board.createDiv({ cls: 'binders-drop-indicator' });
		for (const c of this.cards()) if (items.some((f) => f.path === c.dataset.path)) c.addClass('is-dragging');
		this.board.addClass('is-dragging');
		this.drag = { items, ghost, indicator, drop: null, x, y, raf: 0 };
		this.press.card.removeClass('is-lifted');
		this.dragTo(x, y);
		const tick = () => {
			if (!this.drag) return;
			this.autoscroll();
			this.drag.raf = window.requestAnimationFrame(tick);
		};
		this.drag.raf = window.requestAnimationFrame(tick);
	}

	private dragTo(x: number, y: number): void {
		const d = this.drag;
		if (!d) return;
		d.x = x; d.y = y;
		d.ghost.setCssStyles({ transform: `translate(${x + 12}px, ${y + 12}px)` });
		d.drop = this.dropAt(x, y);
	}

	private autoscroll(): void {
		const d = this.drag, s = this.scroller();
		if (!d) return;
		const r = s.getBoundingClientRect(), edge = 48;
		const v = d.y < r.top + edge ? -(r.top + edge - d.y) : d.y > r.bottom - edge ? d.y - (r.bottom - edge) : 0;
		if (!v) return;
		const before = s.scrollTop;
		s.scrollTop += Math.max(-20, Math.min(20, v / 2));
		if (s.scrollTop !== before) d.drop = this.dropAt(d.x, d.y);
	}

	/** Where a drop at (x, y) would put the dragged items, and the insertion line that shows it. */
	private dropAt(x: number, y: number): Drop | null {
		const d = this.drag, line = d.indicator;
		const secs = [...this.board.querySelectorAll<HTMLElement>('.binders-group')];
		if (!secs.length) return null;
		// the group under the pointer, or the nearest one above or below it
		let sec = secs.find((s) => { const r = s.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
		if (!sec) sec = secs.reduce((best, s) => { const r = s.getBoundingClientRect(), dist = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom)); return !best || dist < best.dist ? { s, dist } : best; }, null as { s: HTMLElement; dist: number } | null).s;
		const g = this.groups[Number(sec.dataset.group)];
		const moving = new Set(d.items.map((f) => f.path));
		// a folder can't go into itself
		if (d.items.some((f) => f instanceof TFolder && (g.folder === f || g.folder.path.startsWith(f.path + '/')))) { line.removeClass('is-active'); return null; }
		const slots = [...sec.querySelectorAll<HTMLElement>('.binders-cards > .binders-card')];
		const rects = slots.map((s) => s.getBoundingClientRect());
		// the row under the pointer (cards sharing a top), then the first card in it whose middle is right of the pointer
		let row = rects.filter((r) => y >= r.top && y <= r.bottom);
		if (!row.length) {
			const near = rects.reduce((b, r) => (Math.abs(y - (r.top + r.height / 2)) < Math.abs(y - (b.top + b.height / 2)) ? r : b), rects[0]);
			row = rects.filter((r) => Math.abs(r.top - near.top) < 1);
		}
		const oneColumn = rects.every((r) => Math.abs(r.left - rects[0].left) < 1);
		let at: number;
		if (oneColumn) {
			at = rects.findIndex((r) => y < r.top + r.height / 2);
			if (at < 0) at = slots.length - 1;
		} else {
			const after = row.find((r) => x < r.left + r.width / 2);
			at = after ? rects.indexOf(after) : rects.indexOf(row[row.length - 1]) + 1;
			if (at >= slots.length) at = slots.length - 1;
		}
		// "+" is always last; dropping on it or after the last card puts the items at the group's end
		const shown = this.shown(g);
		const before = slots[at];
		let anchor: TAbstractFile | null = null;
		for (let i = at; i < shown.length; i++) if (!moving.has(shown[i].path)) { anchor = shown[i]; break; }
		if (!anchor) anchor = g.end;
		// the line: between two cards (or above one, in a single column)
		const br = this.board.getBoundingClientRect(), s = this.board.scrollTop;
		const r = before ? before.getBoundingClientRect() : rects[rects.length - 1];
		const gap = 6;
		line.toggleClass('is-vertical', !oneColumn);
		if (oneColumn) line.setCssStyles({ left: `${r.left - br.left}px`, top: `${r.top - br.top + s - gap}px`, width: `${r.width}px`, height: '' });
		else line.setCssStyles({ left: `${r.left - br.left - gap}px`, top: `${r.top - br.top + s}px`, height: `${r.height}px`, width: '' });
		line.addClass('is-active');
		return { group: g, anchor };
	}

	private endDrag(drop: boolean): void {
		const d = this.drag;
		if (!d) return;
		window.cancelAnimationFrame(d.raf);
		d.ghost.remove();
		d.indicator.remove();
		this.board.removeClass('is-dragging');
		for (const c of this.cards()) c.removeClass('is-dragging');
		this.drag = null;
		// after this task: the redraw replaces the card under the finger, and its touchend must still reach the board
		if (drop && d.drop) window.setTimeout(() => { void this.moveItems(d.items, d.drop.group.folder, d.drop.anchor, d.drop.group.depth); }, 0);
		else if (this.dirty) this.draw();
	}

	/** Moves items, in order, just before `anchor` in `folder` (or to its end), moving files between folders. In a
	    Longform project, `depth` is the group's indent, which the items take. */
	private async moveItems(items: TAbstractFile[], folder: TFolder, anchor: TAbstractFile | null, depth?: number): Promise<void> {
		try {
			for (const f of items) {
				if (f === anchor) continue;
				const sibs = (this.store.orderedChildren(folder) ?? []).filter((x) => x !== f);
				const i = anchor ? sibs.indexOf(anchor) : -1;
				await this.store.move(f, folder, i < 0 ? sibs.length : i, depth);
			}
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
		this.select(items.map((f) => f.path), items[0]?.path ?? null);
		this.draw();
	}

	private scroller(): HTMLElement {
		for (let el: HTMLElement | null = this.container; el; el = el.parentElement) {
			const o = getComputedStyle(el).overflowY;
			if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el;
		}
		return this.container.closest<HTMLElement>('.view-content') ?? this.container;
	}

	// ---- keyboard ----

	private onKey(e: KeyboardEvent): void {
		const card = (e.target as HTMLElement).closest?.<HTMLElement>('.binders-card[data-path]');
		if (!card || e.target !== card) return;
		const cards = this.cards(), i = cards.indexOf(card);
		const go = (to: HTMLElement | undefined) => {
			if (!to) return;
			e.preventDefault();
			if (e.shiftKey) {
				const order = cards.map((c) => c.dataset.path), a = order.indexOf(this.anchor ?? card.dataset.path), b = order.indexOf(to.dataset.path);
				this.select(order.slice(Math.min(a, b), Math.max(a, b) + 1), to.dataset.path, this.anchor ?? card.dataset.path);
			} else this.select([to.dataset.path]);
			to.focus();
			to.scrollIntoView({ block: 'nearest' });
		};
		const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
		if (e.altKey && arrows.includes(e.key) && !Keymap.isModEvent(e)) {
			e.preventDefault();
			if (!this.ctx.readOnly) void this.step(card, e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (Keymap.isModEvent(e) && e.key.toLowerCase() === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); this.select(cards.map((c) => c.dataset.path), card.dataset.path, cards[0]?.dataset.path); return; }
		if (e.altKey || (Keymap.isModEvent(e) && e.key !== 'Enter')) return;
		switch (e.key) {
			case 'ArrowLeft': go(cards[i - 1]); break;
			case 'ArrowRight': go(cards[i + 1]); break;
			case 'ArrowUp': case 'ArrowDown': go(this.vertical(cards, card, e.key === 'ArrowUp' ? -1 : 1)); break;
			case 'Home': go(cards[0]); break;
			case 'End': go(cards[cards.length - 1]); break;
			case 'Enter': e.preventDefault(); this.open(card, Keymap.isModEvent(e)); break;
			case 'Delete': case 'Backspace': if (!this.ctx.readOnly) { e.preventDefault(); void this.remove(this.targets(card)); } break;
			case 'F2': if (!this.ctx.readOnly) { e.preventDefault(); this.editTitle(card); } break;
			case 'Escape': if (this.sel.size > 1) { e.preventDefault(); this.select([card.dataset.path]); } break;
			case 'ContextMenu': this.menuAtCard(e, card); break;
			case 'F10': if (e.shiftKey) this.menuAtCard(e, card); break;
		}
	}

	private menuAtCard(e: KeyboardEvent, card: HTMLElement): void {
		e.preventDefault();
		const r = card.getBoundingClientRect();
		this.cardMenu(card).showAtPosition({ x: r.left + 12, y: r.top + 24 }, this.board.doc);
	}

	/** The card above or below: the nearest by position, since rows can differ between groups. */
	private vertical(cards: HTMLElement[], card: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
		const r = card.getBoundingClientRect(), cx = r.left + r.width / 2;
		let best: HTMLElement | undefined, score = Infinity;
		for (const c of cards) {
			const q = c.getBoundingClientRect();
			if (dir < 0 ? q.bottom > r.top - 1 : q.top < r.bottom + 1) continue;
			const dy = Math.abs((dir < 0 ? r.top - q.bottom : q.top - r.bottom)), dx = Math.abs(q.left + q.width / 2 - cx);
			const s = dy * 4 + dx;
			if (s < score) { score = s; best = c; }
		}
		return best;
	}

	private async step(card: HTMLElement, delta: number): Promise<void> {
		const items = this.targets(card);
		const list = delta < 0 ? items : [...items].reverse();
		for (const f of list) if (!(await this.stepPast(f, delta))) break;
		this.select(items.map((f) => f.path), card.dataset.path);
		this.draw();
		this.cardEl(card.dataset.path)?.focus();
	}

	/** Moves an item one card up or down: past the next card shown, so a filter's hidden notes (and attachments) keep
	    their places. False if no card is shown on that side. */
	private async stepPast(f: TAbstractFile, delta: number): Promise<boolean> {
		const folder = f.parent;
		if (!folder) return false;
		const shown = this.children(folder).filter((x) => !(x instanceof TFile) || this.ctx.visible(x));
		const next = shown[shown.indexOf(f) + (delta < 0 ? -1 : 1)];
		if (!next || shown.indexOf(f) < 0) return false;
		const sibs = (this.store.orderedChildren(folder) ?? []).filter((x) => x !== f);
		await this.store.move(f, folder, sibs.indexOf(next) + (delta < 0 ? 0 : 1));
		return true;
	}

	// ---- actions ----

	/** Each card's title and synopsis fields, for Rename, Edit synopsis and F2. */
	private editors = new Map<string, { title: Editable; synopsis: Editable }>();
	private editTitle(card: HTMLElement): void { this.editors.get(card.dataset.path)?.title.edit(); }
	private editSynopsis(card: HTMLElement): void { this.editors.get(card.dataset.path)?.synopsis.edit(); }

	private async rename(f: TAbstractFile, name: string): Promise<void> {
		const bad = badName(name);
		if (bad) throw new Error(bad);
		// a note named like its folder, or a folder named like a note in it, would make that note the folder note
		if (f instanceof TFile && f.extension === 'md' && name === f.parent?.name) throw new Error('A note can’t have its folder’s name: it would become the folder’s note.');
		if (f instanceof TFolder && f.children.some((c) => c instanceof TFile && c.extension === 'md' && c.basename === name)) throw new Error(`“${f.name}” already has a note called “${name}”, which would become its folder note.`);
		const parent = f.parent?.path ?? '';
		const to = normalizePath(`${parent}/${name}${f instanceof TFile ? '.' + f.extension : ''}`);
		if (to === f.path) return;
		if (this.ctx.app.vault.getAbstractFileByPath(to) && to.toLowerCase() !== f.path.toLowerCase()) throw new Error(`“${name}” already exists here.`);
		const was = f.path, selected = this.sel.has(was);
		await this.ctx.app.fileManager.renameFile(f, to);
		if (selected) { this.sel.delete(was); this.sel.add(f.path); }
		if (this.focused === was) this.focused = f.path;
	}

	private async remove(items: TAbstractFile[]): Promise<void> {
		if (!items.length) return;
		const one = items.length === 1 ? items[0] : null;
		const name = one instanceof TFile ? one.basename : one?.name;
		const notes = one instanceof TFolder ? this.store.scenes(one).length : 0;
		const ok = await confirm(this.ctx.app, {
			title: one ? (one instanceof TFolder ? 'Delete folder' : 'Delete note') : `Delete ${items.length} items`,
			text: one ? (one instanceof TFolder ? `Delete “${name}” and the ${notes} ${notes === 1 ? 'note' : 'notes'} in it?` : `Delete “${name}”?`) : `Delete these ${items.length} items?`,
			cta: 'Delete', warning: true,
		});
		if (!ok) { this.focus(); return; }
		for (const f of items) {
			try { await this.ctx.app.fileManager.trashFile(f); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); break; }
		}
	}

	private async setAll(items: TAbstractFile[], patch: { status?: string; label?: string }): Promise<void> {
		try {
			for (const f of items) {
				const note = f instanceof TFolder ? await this.store.ensureFolderNote(f) : this.noteOf(f);
				if (!note) continue;
				await this.ctx.setProps(note, patch);
			}
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}

	/** Statuses and labels in use in the binder, in the order they first appear. */
	private inUse(key: 'status' | 'label'): string[] {
		const out = new Set<string>();
		for (const f of this.store.scenes(this.ctx.binder.folder)) { const v = this.ctx.props(f)[key]; if (v) out.add(v); }
		return [...out];
	}

	private cardMenu(card: HTMLElement): Menu {
		const items = this.targets(card), one = items.length === 1 ? items[0] : null;
		if (one instanceof TFolder) return this.folderMenu(one, card);
		const menu = new Menu(), ro = this.ctx.readOnly;
		if (one instanceof TFile) {
			menu.addItem((i) => i.setSection('open').setTitle('Open').setIcon('file').onClick(() => void this.ctx.openFile(one, false)));
			menu.addItem((i) => i.setSection('open').setTitle('Open in new tab').setIcon('file-plus').onClick(() => void this.ctx.openFile(one, 'tab')));
			if (!Platform.isPhone) menu.addItem((i) => i.setSection('open').setTitle('Open to the right').setIcon('separator-vertical').onClick(() => void this.ctx.openFile(one, 'split')));
		}
		if (!ro) {
			if (one) {
				menu.addItem((i) => i.setSection('edit').setTitle('Rename').setIcon('pencil-line').onClick(() => this.editTitle(card)));
				menu.addItem((i) => i.setSection('edit').setTitle('Edit synopsis').setIcon('text').onClick(() => this.editSynopsis(card)));
			}
			this.propItems(menu, items);
			if (one) this.orderItems(menu, one);
			menu.addItem((i) => i.setSection('danger').setTitle(one ? 'Delete' : `Delete ${items.length} items`).setIcon('trash-2').setWarning(true).onClick(() => void this.remove(items)));
		}
		return menu;
	}

	private folderMenu(folder: TFolder, card: HTMLElement | null): Menu {
		const menu = new Menu(), ro = this.ctx.readOnly;
		menu.addItem((i) => i.setSection('open').setTitle('Open').setIcon('layout-grid').onClick(() => this.ctx.navigate(folder)));
		menu.addItem((i) => i.setSection('open').setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.ctx.navigate(folder, 'tab')));
		const note = this.store.folderNote(folder);
		if (note) menu.addItem((i) => i.setSection('open').setTitle('Open folder note').setIcon('file-text').onClick(() => void this.ctx.openFile(note, false)));
		if (!ro) {
			if (card) {
				menu.addItem((i) => i.setSection('edit').setTitle('Rename').setIcon('pencil-line').onClick(() => this.editTitle(card)));
				menu.addItem((i) => i.setSection('edit').setTitle('Edit synopsis').setIcon('text').onClick(() => this.editSynopsis(card)));
			}
			this.propItems(menu, [folder]);
			this.orderItems(menu, folder);
			if (card) menu.addItem((i) => i.setSection('danger').setTitle('Delete').setIcon('trash-2').setWarning(true).onClick(() => void this.remove([folder])));
		}
		return menu;
	}

	private propItems(menu: Menu, items: TAbstractFile[]): void {
		const cur = (key: 'status' | 'label') => {
			const vals = new Set(items.map((f) => { const n = this.noteOf(f); return n ? this.ctx.props(n)[key] : ''; }));
			return vals.size === 1 ? [...vals][0] : null;
		};
		menu.addItem((i) => {
			i.setSection('props').setTitle('Set status').setIcon('circle-dot');
			submenu(i, (m) => {
				const now = cur('status');
				for (const s of this.inUse('status')) m.addItem((x) => x.setTitle(display(s)).setChecked(now === s).onClick(() => void this.setAll(items, { status: s })));
				m.addItem((x) => x.setSection('new').setTitle('New status…').setIcon('plus').onClick(async () => {
					const s = await ask(this.ctx.app, { title: 'New status', placeholder: 'Draft, revised, done…', cta: 'Set status' });
					if (s) await this.setAll(items, { status: s });
				}));
				if (now !== '') m.addItem((x) => x.setSection('new').setTitle('No status').setIcon('x').onClick(() => void this.setAll(items, { status: '' })));
			});
		});
		menu.addItem((i) => {
			i.setSection('props').setTitle('Set label').setIcon('palette');
			submenu(i, (m) => {
				const now = cur('label');
				const names = [...LABEL_COLORS, ...this.inUse('label').filter((l) => !(LABEL_COLORS as readonly string[]).includes(l.toLowerCase()))];
				for (const l of names) {
					const t = createFragment();
					labelDot(t, l);
					t.appendText(display(l));
					m.addItem((x) => x.setTitle(t).setChecked(!!now && now.toLowerCase() === l.toLowerCase()).onClick(() => void this.setAll(items, { label: l })));
				}
				if (now !== '') m.addItem((x) => x.setSection('none').setTitle('No label').setIcon('x').onClick(() => void this.setAll(items, { label: '' })));
			});
		});
	}

	private orderItems(menu: Menu, f: TAbstractFile): void {
		// among the cards shown, as Alt+Up and Alt+Down
		const sibs = f.parent ? this.children(f.parent).filter((x) => !(x instanceof TFile) || this.ctx.visible(x)) : [], i = sibs.indexOf(f);
		if (i > 0) menu.addItem((x) => x.setSection('order').setTitle('Move up').setIcon('arrow-up').onClick(() => void this.stepPast(f, -1)));
		if (i >= 0 && i < sibs.length - 1) menu.addItem((x) => x.setSection('order').setTitle('Move down').setIcon('arrow-down').onClick(() => void this.stepPast(f, 1)));
	}
}
