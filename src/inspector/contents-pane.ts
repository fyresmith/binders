import { Keymap, Platform, TFile, TFolder, setIcon, type Component, type TAbstractFile, type ViewStateResult } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { labelDot, readLabel } from '../view/labels';
import { readProps } from '../view/props';
import { WordCounter } from '../view/word-counter';
import { wordsLabel } from '../view/words';
import type { Follow, Target } from './follow';
import { FollowingView, showSide } from './views';

/* The contents of a binder, a view in the sidebar: the whole book as one list in reading order, with where the
   writer is. A click goes there in the binder view that's open (the manuscript scrolls to the section, a board opens
   the folder and selects the card, the outliner shows the row), and opens the note only when there is no such view.
   It is read-only: order is changed in the file explorer and in the views, not here (the maintainer's choice for
   1.0). The rows are Obsidian's own tree (`tree-item`), as its outline of a note is, and are walked with the keys
   that walk the file explorer.

   A book can be thousands of notes, so the list is kept, not drawn again: a change to the binder puts right the
   rows that differ (`sync`), and a change of place (the cursor, a scroll) only moves the mark (`mark`). */

export const CONTENTS_VIEW = 'binders-contents';
export const CONTENTS_ICON = 'book-open';

/** A row as it should be. */
interface Entry { item: TAbstractFile; path: string; name: string; depth: number; label: string; folder: boolean }
/** A row as it is drawn. */
interface Row { el: HTMLElement; self: HTMLElement; inner: HTMLElement; kids: HTMLElement | null; fold: HTMLElement | null; sig: string; item: TAbstractFile; parent: string | null }

export class ContentsPane {
	readonly el: HTMLElement;
	private list: HTMLElement;
	private foot: HTMLElement;
	/** The data's revision the list was last read at, and for which binder (see Follow.rev). */
	private read = '';
	private binder: Binder | null = null;
	private target: Target | null = null;
	private rows = new Map<string, Row>();
	/** The rows in the order they show, folded or not (the keys walk the ones in sight). */
	private order: string[] = [];
	private book: HTMLElement | null = null;
	private here: string | null = null;
	private words: WordCounter;
	/** The folders folded shut, by path. */
	folded = new Set<string>();

	/** `folds`: told when a folder is folded or opened, so the view can keep it. */
	constructor(parent: HTMLElement, private plugin: BindersPlugin, private follow: Follow, owner: Component, private folds: () => void) {
		this.el = parent.createDiv({ cls: 'binders-contents' });
		this.list = this.el.createDiv({ cls: 'binders-contents-list', attr: { role: 'tree', 'aria-label': 'Contents' } });
		this.foot = this.el.createDiv({ cls: 'binders-contents-foot' });
		this.words = new WordCounter(plugin, () => this.count());
		owner.registerEvent(plugin.app.vault.on('modify', () => this.count()));
		// one listener each for every row, however many there are
		const rowOf = (e: Event): { path: string; self: HTMLElement } | null => {
			const self = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.tree-item-self[data-path]') : null;
			return self?.dataset.path != null && this.list.contains(self) ? { path: self.dataset.path, self } : null;
		};
		owner.registerDomEvent(this.list, 'click', (e) => {
			const r = rowOf(e);
			if (!r) return;
			if (e.target instanceof Element && e.target.closest('.collapse-icon')) { this.fold(r.path); return; }
			void this.go(r.path, Keymap.isModEvent(e));
		});
		owner.registerDomEvent(this.list, 'auxclick', (e) => { const r = rowOf(e); if (r && e.button === 1) void this.go(r.path, 'tab'); });
		owner.registerDomEvent(this.list, 'keydown', (e) => this.onKey(e));
		owner.registerDomEvent(this.list, 'focusin', (e) => { const r = rowOf(e); if (r) this.stop(r.self); });
	}

	show(t: Target): void {
		this.target = t;
		// (a note outside any binder is open: the book last shown stays, with nowhere marked)
		const binder = t.binder ?? this.follow.lastBinder;
		if (binder !== this.binder) { this.binder = binder; this.read = ''; }
		if (!binder) {
			if (this.rows.size || !this.list.firstChild) { this.clear(); this.list.createDiv({ cls: 'pane-empty', text: 'No binder is open.' }); }
			return;
		}
		// (only the place changed: the list stands, and the mark moves)
		const read = `${binder.note.path}|${this.follow.rev}`;
		if (read !== this.read) { this.read = read; this.sync(binder); this.count(); }
		this.mark(t.binder ? t.here : null);
	}

	private clear(): void {
		this.list.empty();
		this.foot.empty();
		this.rows.clear();
		this.order = [];
		this.book = null;
		this.here = null;
		this.read = '';
	}

	/** Every item of the binder as a row should show it, in reading order. */
	private entries(binder: Binder): Entry[] {
		const store = this.plugin.binders, out: Entry[] = [], cache = this.plugin.app.metadataCache;
		// (a label alone is read, as every view reads one: not the rest of a note's card data, for each of thousands)
		const prop = this.plugin.settings.labelProp, names = this.plugin.settings.labels.map((l) => l.name);
		const walk = (folder: TFolder, depth: number) => {
			for (const c of store.orderedChildren(folder) ?? []) {
				const note = c instanceof TFolder ? store.folderNote(c) : c instanceof TFile ? c : null;
				// (a Longform project's scenes are indented under one another, not in folders)
				out.push({ item: c, path: c.path, name: c instanceof TFile ? c.basename : c.name, depth: depth + (store.depthOf(c) ?? 0), label: note ? readLabel(cache.getFileCache(note)?.frontmatter?.[prop], names) : '', folder: c instanceof TFolder });
				if (c instanceof TFolder) walk(c, depth + 1);
			}
		};
		walk(binder.folder, 0);
		return out;
	}

	/** Puts the list right: rows that are gone leave, new ones are made, and each is where it belongs and says what
	    it should. A row that hasn't changed isn't touched. */
	private sync(binder: Binder): void {
		const list = this.list, presets = this.plugin.settings.labels, entries = this.entries(binder);
		if (!this.book || !this.book.isConnected) {
			this.clear();
			// the book itself, as a heading: a click shows the whole of it
			this.book = list.createDiv({ cls: 'binders-contents-book tree-item-self is-clickable', attr: { tabindex: '0', role: 'treeitem' } });
			this.book.createDiv({ cls: 'tree-item-inner' });
			this.read = `${binder.note.path}|${this.follow.rev}`;
		}
		const book = this.book;
		if (book.dataset.path !== binder.folder.path) { book.dataset.path = binder.folder.path; book.firstElementChild?.setText(binder.folder.name); }
		const want = new Set(entries.map((e) => e.path));
		for (const [path, row] of this.rows) if (!want.has(path)) { row.el.remove(); this.rows.delete(path); }
		// where the next row of each holder goes: after the last one put there (null: first). Kept as the row put last,
		// not the one after it: that one may be moved into another holder later in this pass (a Longform scene
		// indented under another), and is then no place to insert before
		const at = new Map<HTMLElement, Element | null>([[list, book]]);
		const stack: (Row | null)[] = [];
		this.order = [binder.folder.path];
		for (const e of entries) {
			stack.length = e.depth;
			let up: Row | null = null;
			for (let d = e.depth - 1; d >= 0 && !up; d--) up = stack[d] ?? null;
			let holder = list;
			if (up) {
				// (made when a row first has something under it: a folder, or a Longform scene with scenes indented under it)
				up.kids ??= up.el.createDiv({ cls: 'tree-item-children nav-folder-children', attr: { role: 'group' } });
				holder = up.kids;
				if (!at.has(holder)) at.set(holder, null);
			}
			const sig = `${e.name}\n${e.label}\n${JSON.stringify(presets.find((p) => p.name === e.label) ?? null)}`;
			let row = this.rows.get(e.path);
			if (!row || (row.fold !== null) !== e.folder) {
				row?.el.remove();
				const el = createDiv({ cls: e.folder ? 'tree-item nav-folder' : 'tree-item nav-file' });
				const self = el.createDiv({ cls: `tree-item-self is-clickable ${e.folder ? 'nav-folder-title mod-collapsible' : 'nav-file-title'}`, attr: { tabindex: '-1', role: 'treeitem' } });
				self.dataset.path = e.path;
				let fold: HTMLElement | null = null;
				if (e.folder) { fold = self.createDiv({ cls: 'tree-item-icon collapse-icon' }); setIcon(fold, 'right-triangle'); }
				const inner = self.createDiv({ cls: `tree-item-inner ${e.folder ? 'nav-folder-title-content' : 'nav-file-title-content'}` });
				row = { el, self, inner, kids: null, fold, sig: '', item: e.item, parent: null };
				this.rows.set(e.path, row);
			}
			row.item = e.item;
			row.parent = up ? up.self.dataset.path ?? null : null;
			if (row.sig !== sig) {
				row.sig = sig;
				row.inner.setText(e.name);
				row.self.querySelector(':scope > .tree-item-flair-outer')?.remove();
				if (e.label) labelDot(row.self.createDiv({ cls: 'tree-item-flair-outer' }), e.label, presets);
			}
			if (e.folder) this.paintFold(row, e.path);
			const last = at.get(holder) ?? null, next = last ? last.nextElementSibling : holder.firstElementChild;
			if (next !== row.el) holder.insertBefore(row.el, next);
			at.set(holder, row.el);
			stack[e.depth] = row;
			this.order.push(e.path);
		}
		// (a row that had something under it and has nothing now: its holder goes)
		for (const row of this.rows.values()) if (row.kids && !row.kids.firstElementChild) { row.kids.remove(); row.kids = null; }
		for (const p of [...this.folded]) if (!want.has(p)) this.folded.delete(p);
		if (this.here && !this.rowEl(this.here)) this.here = null;
		if (!list.querySelector('.tree-item-self[tabindex="0"]')) book.setAttr('tabindex', '0');
	}

	private rowEl(path: string | null): HTMLElement | null { return path == null ? null : path === this.book?.dataset.path ? this.book : this.rows.get(path)?.self ?? null; }

	private paintFold(row: Row, path: string): void {
		const shut = this.folded.has(path);
		row.el.toggleClass('is-collapsed', shut);
		row.fold?.toggleClass('is-collapsed', shut);
		row.self.setAttr('aria-expanded', String(!shut));
	}

	/** Folds a folder shut, or opens it (`to`: which; left out, the other). */
	private fold(path: string, to?: boolean): void {
		const row = this.rows.get(path);
		if (!row?.fold) return;
		const shut = to ?? !this.folded.has(path);
		if (shut === this.folded.has(path)) return;
		if (shut) this.folded.add(path); else this.folded.delete(path);
		this.paintFold(row, path);
		// (the keyboard isn't left on a row that has just gone out of sight)
		const active = this.list.doc.activeElement;
		if (shut && active && row.kids?.contains(active)) row.self.focus({ preventScroll: true });
		this.folds();
		this.mark(this.target?.binder ? this.target.here : null);
	}

	/** Folds as they were kept (a reload): painted on the rows there are. */
	setFolded(paths: string[]): void {
		this.folded = new Set(paths);
		for (const [path, row] of this.rows) if (row.fold) this.paintFold(row, path);
	}

	/** Is this row out of sight inside a folded folder? The folder it is hidden in, outermost first. */
	private hiddenIn(path: string): string | null {
		let found: string | null = null;
		for (let up = this.rows.get(path)?.parent ?? null; up; up = this.rows.get(up)?.parent ?? null) if (this.folded.has(up)) found = up;
		return found;
	}

	/** "You are here": Obsidian's active row. Inside a folded folder, the folder. */
	private mark(item: TAbstractFile | null): void {
		let path = item?.path ?? null;
		if (path && !this.rowEl(path)) path = null;
		if (path) path = this.hiddenIn(path) ?? path;
		const row = this.rowEl(path);
		if (path === this.here && (!row || row.hasClass('is-active'))) return;
		this.rowEl(this.here)?.removeClass('is-active');
		this.here = path;
		if (!row) return;
		row.addClass('is-active');
		// brought into sight, by as little as it takes; not while the pointer or the keyboard is choosing a row here
		if (!this.list.matches(':hover') && !this.list.contains(this.list.doc.activeElement)) {
			const r = row.getBoundingClientRect(), v = this.list.getBoundingClientRect();
			if (r.top < v.top) this.list.scrollTop -= v.top - r.top + 8; else if (r.bottom > v.bottom) this.list.scrollTop += r.bottom - v.bottom + 8;
		}
	}

	/** One row is the list's stop for Tab: the one the keyboard was last on. */
	private stop(self: HTMLElement): void {
		for (const el of Array.from(this.list.querySelectorAll('.tree-item-self[tabindex="0"]'))) if (el !== self) el.setAttr('tabindex', '-1');
		self.setAttr('tabindex', '0');
	}

	/** The keys that walk Obsidian's file explorer and its outline: up and down the rows in sight, right into a
	    folder (opening it first), left out of one (closing it first), Home and End, Enter to go there. */
	private onKey(e: KeyboardEvent): void {
		const self = e.target instanceof HTMLElement && e.target.matches('.tree-item-self[data-path]') ? e.target : null, path = self?.dataset.path;
		if (!self || path == null || e.altKey || e.isComposing) return;
		const seen = this.order.filter((p) => !this.hiddenIn(p)), i = seen.indexOf(path), row = this.rows.get(path);
		const to = (p: string | undefined | null) => { const el = this.rowEl(p ?? null); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); } };
		switch (e.key) {
			case 'ArrowDown': to(seen[i + 1]); break;
			case 'ArrowUp': to(seen[i - 1]); break;
			case 'Home': to(seen[0]); break;
			case 'End': to(seen[seen.length - 1]); break;
			case 'ArrowRight': if (row?.fold && this.folded.has(path)) this.fold(path, false); else if (row?.kids) to(seen[i + 1]); break;
			case 'ArrowLeft': if (row?.fold && !this.folded.has(path) && row.kids) this.fold(path, true); else to(row?.parent ?? this.book?.dataset.path); break;
			case 'Enter': case ' ': void this.go(path, Keymap.isModEvent(e)); break;
			default: return;
		}
		e.preventDefault();
	}

	/** Goes to an item: in the binder view the writer is in, if there is one; else it opens. */
	private async go(path: string, newLeaf: ReturnType<typeof Keymap.isModEvent>): Promise<void> {
		const plugin = this.plugin, ws = plugin.app.workspace, binder = this.binder, view = this.target?.binder === binder ? this.target?.view : null;
		const item = plugin.app.vault.getAbstractFileByPath(path);
		if (!binder || !item) return;
		if (newLeaf || !view || !view.folder) {
			if (item instanceof TFile) await ws.getLeaf(newLeaf || false).openFile(item);
			else if (item instanceof TFolder) await plugin.openBinder(item, newLeaf);
			return;
		}
		// a board shows one folder: the one the item is in. The manuscript and the outliner show everything under
		// theirs: only an item outside it takes them up to the binder.
		const folder = view.folder, inside = item === folder || item.path.startsWith(folder.path + '/');
		const board = view.mode === 'corkboard' && view.arrangement !== 'label';
		const want = board ? (item instanceof TFolder ? item : item.parent ?? binder.folder) : inside ? folder : binder.folder;
		if (want !== folder) await view.navigate(want);
		ws.setActiveLeaf(view.leaf, { focus: true });
		if (item !== want) view.revealItem(item);
		// (on a phone the drawer these are in covers the view: it gets out of the way of what was gone to)
		if (Platform.isPhone) { const root = ws.getLeavesOfType(CONTENTS_VIEW).find((l) => l.view.containerEl.contains(this.el))?.getRoot(); (root === ws.leftSplit ? ws.leftSplit : ws.rightSplit).collapse(); }
	}

	/** The book's length under the list, in words. */
	private count(): void {
		const binder = this.binder;
		if (!binder || !this.book) return;
		const store = this.plugin.binders, n = this.words.sum(store.scenes(binder.folder)), goal = readProps(this.plugin, binder.note).target;
		const say = n == null ? '' : goal ? `${n.toLocaleString()} of ${wordsLabel(goal)}` : wordsLabel(n);
		if (this.foot.getText() !== say) this.foot.setText(say);
	}
}

/** The contents (`binders-contents`). Which folders are folded is kept with the view, in the workspace. */
export class ContentsView extends FollowingView {
	private pane: ContentsPane | null = null;
	private folded: string[] = [];
	getViewType(): string { return CONTENTS_VIEW; }
	getDisplayText(): string { return 'Contents'; }
	getIcon(): string { return CONTENTS_ICON; }

	getState(): Record<string, unknown> { return { ...super.getState(), folded: this.pane ? [...this.pane.folded] : this.folded }; }
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const f = (state as { folded?: unknown } | null)?.folded;
		if (Array.isArray(f)) { this.folded = f.filter((x): x is string => typeof x === 'string'); this.pane?.setFolded(this.folded); }
		await super.setState(state, result);
	}

	protected build(): void {
		this.contentEl.addClass('binders-contents-view');
		this.pane = new ContentsPane(this.contentEl, this.plugin, this.follow, this, () => this.app.workspace.requestSaveLayout());
		this.pane.setFolded(this.folded);
	}
	protected turn(t: Target): void { this.pane?.show(t); }
}

/** Registers the contents and the command that shows them. */
export function installContents(plugin: BindersPlugin, follow: Follow): void {
	plugin.registerView(CONTENTS_VIEW, (leaf) => new ContentsView(leaf, plugin, follow));
	plugin.addCommand({ id: 'show-contents', name: 'Show contents', icon: CONTENTS_ICON, callback: () => void showSide(plugin, CONTENTS_VIEW) });
}
