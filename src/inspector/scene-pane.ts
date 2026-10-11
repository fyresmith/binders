import { Menu, Notice, TFile, TFolder, setIcon, type Component, type TAbstractFile } from 'obsidian';
import { ROLES } from '../export/model';
import type BindersPlugin from '../main';
import { COMPILE_PROP, EXPORT_PROP, saveOpen } from '../scenes';
import { isScene, snapshotsOf, type Snapshot } from '../snapshots';
import { labelItems, setAll, setExported, statusItems } from '../view/actions';
import { commitAll, editable, editingIn } from '../view/edit';
import { labelDot, labelName } from '../view/labels';
import type { ModeContext } from '../view/mode';
import { parseTarget, whyNotTarget } from '../view/outliner-data';
import { readNotes, readProps, writeBatch, writeExportAs, writeNotes, writeProps } from '../view/props';
import { SnapshotsModal, take, whenShort } from '../view/snapshots';
import { folderSnapshots, hasSnapshots } from '../binder-snapshots';
import { FolderSnapshotsModal, takeFolder } from '../view/binder-snapshots';
import { WordCounter } from '../view/word-counter';
import { wordsIn, wordsLabel } from '../view/words';
import type { Follow, Target } from './follow';
import { ROLE_NAMES, rolesOf, type Played } from './roles';

/* The inspector's pane on what is in hand: a note, a folder (its data is in its folder note), the binder, or several
   at once. A synopsis, the label, status and target, whether it's exported and as what, notes on it, and a note's
   snapshots. It writes through the same functions the cards and the outliner's rows do (view/props.ts,
   view/actions.ts), so there is one way a property reaches a note.

   Nothing typed is lost when the pane turns to something else (golden rule 2). Every field saves to the note it was
   opened on, not to "the current one"; the pane saves what's being typed before it shows another item, and stays on
   the first, with the text in its field, if that can't be saved; while a field is being typed in the pane draws
   nothing; and the view it is in saves open fields on every way out (inspector/views.ts). */

const count = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export class ScenePane {
	readonly el: HTMLElement;
	private key = '';
	/** What was last drawn was drawn from: the data's revision and this pane's own (a count read, an edit ended). */
	private drawn = '';
	private tick = 0;
	private want: Target | null = null;
	/** The last thing it was told to show, drawn or not. */
	private latest: Target | null = null;
	private busy = false;
	private stale = false;
	private words: WordCounter;
	/** A note's snapshots, read in the background, by the note's path. */
	private snaps = new Map<string, Snapshot[]>();
	/** The notes whose snapshots are being read now, by path: true once something has changed since the read began. */
	private reading = new Map<string, boolean>();
	/** A binder's roles, as read at one revision of the data. */
	private roles: { at: string; of: Map<string, Played> } | null = null;

	constructor(parent: HTMLElement, private plugin: BindersPlugin, private follow: Follow, private owner: Component) {
		this.el = parent.createDiv({ cls: 'binders-inspector' });
		this.words = new WordCounter(plugin, () => this.again());
		// a snapshot taken, named or deleted anywhere: this note's list is read again
		const stale = (path: string) => { if (plugin.binders.inSnapshots(path)) { this.snaps.clear(); for (const k of this.reading.keys()) this.reading.set(k, true); this.again(); } };
		owner.registerEvent(plugin.app.vault.on('create', (f) => stale(f.path)));
		owner.registerEvent(plugin.app.vault.on('delete', (f) => stale(f.path)));
		owner.registerEvent(plugin.app.vault.on('rename', (f, old) => { stale(f.path); stale(old); }));
	}

	/** Turns to what the inspector is on now. */
	show(t: Target): void { this.want = this.latest = t; void this.run(); }

	/** Draws the same thing again (a count arrived, an edit ended). */
	private again(): void { this.tick++; if (this.latest && !this.want) this.show(this.latest); }

	private async run(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			while (this.want) {
				const t = this.want, key = this.keyOf(t);
				this.want = null;
				if (editingIn(this.el)) {
					// the same item: what's being typed is left alone, and the rest is drawn when the edit ends
					if (key === this.key) { this.stale = true; continue; }
					// another item: what's being typed is saved first, to the note it was typed for; refused, it stays
					await commitAll(this.el);
					if (editingIn(this.el)) { this.stale = true; continue; }
				}
				// (the cursor moved within the same section, the page scrolled: nothing to draw)
				const from = `${this.follow.rev}|${this.tick}`;
				if (key === this.key && from === this.drawn) continue;
				this.key = key;
				this.drawn = from;
				this.stale = false;
				this.draw(t);
			}
		} finally { this.busy = false; }
	}

	private keyOf(t: Target): string { return JSON.stringify([t.kind, t.binder?.note.path, t.binder?.problem, t.items.map((f) => f.path)]); }

	private context(t: Target): ModeContext | null {
		const binder = t.binder, plugin = this.plugin;
		if (!binder) return null;
		const ro = !!binder.problem;
		return {
			app: plugin.app, plugin, store: plugin.binders, binder, folder: binder.folder, owner: this.owner, readOnly: ro,
			props: (f) => readProps(plugin, f),
			setProps: async (f, p) => { if (ro) throw new Error('This binder is read only.'); await writeProps(plugin, f, p); },
			setPropsMany: async (w) => { if (ro) throw new Error('This binder is read only.'); await writeBatch(plugin, w); },
			openFile: async (f, newLeaf) => { await saveOpen(plugin.app, [f]); await plugin.app.workspace.getLeaf(newLeaf || false).openFile(f); },
			navigate: (f, newLeaf) => void plugin.openBinder(f, newLeaf),
			words: (f) => this.words.get(f),
			visible: () => true, made: () => {}, filtering: () => false,
			option: <T>(_key: string, fallback: T): T => fallback, setOption: () => {},
		};
	}

	/** Where an item's data is: the note itself, a folder's folder note (null until it has one). */
	private noteOf(item: TAbstractFile): TFile | null { return item instanceof TFolder ? this.plugin.binders.folderNote(item) : item instanceof TFile ? item : null; }
	private async noteFor(item: TAbstractFile): Promise<TFile> {
		if (item instanceof TFolder) return this.plugin.binders.ensureFolderNote(item);
		if (item instanceof TFile) return item;
		throw new Error('That isn’t a note or a folder.');
	}

	private draw(t: Target): void {
		const el = this.el, doc = el.doc, at = doc.activeElement, had = at?.instanceOf(HTMLElement) && el.contains(at) ? at.dataset.field : undefined, top = el.scrollTop;
		el.empty();
		const ctx = this.context(t);
		if (t.kind !== 'items' || !ctx) {
			el.createDiv({ cls: 'pane-empty', text: t.kind === 'outside' ? 'This note isn’t in a binder.' : 'No binder is open.' });
			return;
		}
		const { plugin } = this, store = plugin.binders, items = t.items, one = items.length === 1 ? items[0] : null, ro = ctx.readOnly, binder = ctx.binder;
		const notes = items.flatMap((f) => (f instanceof TFolder ? store.scenes(f) : f instanceof TFile ? [f] : []));
		const props = items.map((f) => { const n = this.noteOf(f); return n ? readProps(plugin, n) : { synopsis: '', status: '', label: '', target: 0 }; });
		const shared = <K extends 'status' | 'label' | 'target'>(k: K) => (props.every((p) => p[k] === props[0][k]) ? props[0][k] : null);

		// what it is, and how long
		const head = el.createDiv({ cls: 'binders-inspector-head' });
		const folders = items.filter((f) => f instanceof TFolder).length;
		head.createDiv({ cls: 'binders-inspector-name', text: one ? (one instanceof TFile ? one.basename : one.name) : folders ? `${count(items.length, 'item')} selected` : `${count(items.length, 'note')} selected` });
		const n = this.words.sum(notes), target = one ? props[0].target : 0;
		const parts: string[] = [];
		if (one instanceof TFolder || !one) parts.push(count(notes.length, 'note'));
		if (n != null) parts.push(target ? `${n.toLocaleString()} of ${wordsLabel(target)}` : wordsLabel(n));
		head.createDiv({ cls: 'binders-inspector-detail', text: parts.join(' · ') || '​' });
		// (why nothing here can be changed: a binder in a newer format)
		if (binder.problem) el.createDiv({ cls: 'binders-inspector-problem', text: `This binder can’t be changed. ${binder.problem}` });

		// the synopsis: the card's text
		if (one) {
			const note = this.noteOf(one);
			editable(el, {
				cls: 'binders-inspector-synopsis', value: props[0].synopsis, placeholder: 'Add a synopsis', readOnly: ro, focusable: true, label: 'Synopsis',
				save: async (typed) => { await ctx.setProps(note ?? await this.noteFor(one), { synopsis: typed }); },
				onEditing: (on) => this.editing(on),
			}).el.dataset.field = 'synopsis';
		}

		// its properties, as rows: Obsidian's own, from the properties of a note
		const rows = el.createDiv({ cls: 'metadata-container binders-inspector-props' }).createDiv({ cls: 'metadata-properties' });
		const pick = (field: string, value: HTMLElement, fill: (m: Menu) => void) => {
			const b = value.createDiv({ cls: 'binders-inspector-value', attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'menu' } });
			b.dataset.field = field;
			if (ro) { b.setAttr('aria-disabled', 'true'); return b; }
			const open = () => { const m = new Menu(), r = value.getBoundingClientRect(); fill(m); m.showAtPosition({ x: r.left, y: r.bottom + 2, width: r.width, overlap: true, left: false }, value.doc); };
			b.addEventListener('click', open);
			b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
			return b;
		};
		const presets = plugin.settings.labels;
		const label = shared('label'), lb = pick('label', this.row(rows, 'palette', 'Label'), (m) => labelItems(ctx, m, items));
		if (label) { labelDot(lb, label, presets); lb.createSpan({ text: labelName(label, presets) }); } else lb.createSpan({ cls: 'binders-inspector-none', text: label === null ? 'Mixed' : 'No label' });
		const status = shared('status'), sb = pick('status', this.row(rows, 'circle-dot', 'Status'), (m) => statusItems(ctx, m, items));
		sb.createSpan({ cls: status ? '' : 'binders-inspector-none', text: status || (status === null ? 'Mixed' : 'No status') });
		const goal = shared('target');
		editable(this.row(rows, 'target', 'Target'), {
			cls: 'binders-inspector-value', value: goal ? goal.toLocaleString() : '', editValue: goal ? String(goal) : '', placeholder: goal === null ? 'Mixed' : 'No target', singleLine: true, numeric: true, allowEmpty: true, readOnly: ro, focusable: true, label: 'Word count target',
			save: async (typed) => {
				const to = parseTarget(typed);
				if (to == null) throw new Error(whyNotTarget(typed) ?? 'A target is a whole number of words.');
				await setAll(ctx, items, { target: to });
			},
			onEditing: (on) => this.editing(on),
		}).el.dataset.field = 'target';

		// whether it's exported, and as what (the book itself is neither: it is what's exported)
		if (!items.includes(binder.folder)) this.exporting(rows, ctx, items, pick);

		// notes on it: never part of the manuscript
		if (one) {
			const note = this.noteOf(one);
			el.createDiv({ cls: 'binders-inspector-heading', text: 'Notes' });
			editable(el, {
				cls: 'binders-inspector-notes', value: note ? readNotes(plugin, note) : '', placeholder: 'Add notes', readOnly: ro, focusable: true, label: 'Notes',
				save: async (typed) => { if (ro) throw new Error('This binder is read only.'); await writeNotes(plugin, note ?? await this.noteFor(one), typed); },
				onEditing: (on) => this.editing(on),
			}).el.dataset.field = 'notes';
		}

		// a note's snapshots
		if (one instanceof TFile && isScene(plugin, one)) this.snapshots(el, one, ro);
		// a folder's, or the binder's: everything in it, as it stood
		if (one instanceof TFolder && hasSnapshots(plugin, one)) this.folderSnapshots(el, one, ro);

		el.scrollTop = top;
		if (had) el.querySelector<HTMLElement>(`[data-field="${had}"]`)?.focus({ preventScroll: true });
	}

	/** One property: its icon and name, and the element its value goes in. */
	private row(parent: HTMLElement, icon: string, name: string): HTMLElement {
		const row = parent.createDiv({ cls: 'metadata-property' });
		const key = row.createDiv({ cls: 'metadata-property-key' });
		setIcon(key.createSpan({ cls: 'metadata-property-icon' }), icon);
		key.createSpan({ cls: 'binders-inspector-key', text: name });
		return row.createDiv({ cls: 'metadata-property-value' });
	}

	/** "Include in export", and the part it plays in the book: the one written on it, or the one export would give
	    it by its place, said to be that. */
	private exporting(rows: HTMLElement, ctx: ModeContext, items: TAbstractFile[], pick: (field: string, value: HTMLElement, fill: (m: Menu) => void) => HTMLElement): void {
		const { plugin } = this, ro = ctx.readOnly;
		// (its own switch, not a folder's above it: that is what the box here sets)
		const own = (f: TAbstractFile) => { const note = this.noteOf(f), fm = note ? plugin.app.metadataCache.getFileCache(note)?.frontmatter : null; return !fm || (fm[EXPORT_PROP] !== false && fm[COMPILE_PROP] !== false); };
		const inc = items.filter(own).length, box = this.row(rows, 'book-up', 'Include in export').createEl('input', { cls: 'metadata-input-checkbox', type: 'checkbox', attr: { 'aria-label': 'Include in export' } });
		box.dataset.field = 'export';
		box.checked = inc === items.length;
		box.indeterminate = inc > 0 && inc < items.length;
		box.disabled = ro;
		box.addEventListener('change', () => void setExported(ctx, items, box.checked));

		const at = `${ctx.binder.note.path}|${this.follow.rev}`;
		if (this.roles?.at !== at) this.roles = { at, of: rolesOf(plugin, ctx.binder) };
		const played = items.map((f) => this.roles?.of.get(f.path) ?? null), first = played[0];
		const same = !!first && played.every((p) => p && p.said === first.said && p.role === first.role && p.auto === first.auto);
		const folders = items.some((f) => f instanceof TFolder);
		const set = async (role: (typeof ROLES)[number] | null) => {
			try {
				if (ro) throw new Error('This binder is read only.');
				// (the one way "Export as" is written: view/props.ts. The box above is this pane's way to leave out or put back)
				await writeExportAs(plugin, items, role ?? 'auto', false);
			} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
		};
		const rb = pick('role', this.row(rows, 'book-open', 'Export as'), (m) => {
			const auto = same && first && first.auto !== 'out' ? `Automatic: ${ROLE_NAMES[first.auto].toLowerCase()}` : 'Automatic';
			m.addItem((i) => i.setSection('auto').setTitle(auto).setChecked(played.every((p) => !p?.said)).onClick(() => void set(null)));
			// (a folder can't be a scene: it holds them)
			for (const r of ROLES) if (!(folders && r === 'scene')) m.addItem((i) => i.setSection('roles').setTitle(ROLE_NAMES[r]).setChecked(same && first?.said === r).onClick(() => void set(r)));
		});
		if (!same || !first) rb.createSpan({ cls: 'binders-inspector-none', text: first ? 'Mixed' : 'Automatic' });
		else if (first.role === 'out') rb.createSpan({ cls: 'binders-inspector-none', text: ROLE_NAMES.out });
		else {
			const role = rb.createSpan({ text: ROLE_NAMES[first.role] });
			// (not written on it: what export makes of it where it stands, which can change as the book does)
			// (`has-auto`: the role is never cut short for the word after it, styles.css)
			if (!first.said) { role.addClass('has-auto'); rb.createSpan({ cls: 'binders-inspector-none binders-inspector-auto', text: 'auto' }); rb.setAttr('aria-label', `${ROLE_NAMES[first.role]}, automatic`); }
		}
	}

	private snapshots(el: HTMLElement, scene: TFile, ro: boolean): void {
		const plugin = this.plugin, list = this.snaps.get(scene.path);
		// one read of a note's snapshots at a time: files that arrive in a burst (sync) each draw this again, and a read
		// begun for each of them was 200 reads of up to 200 files. One that the folder changed under isn't kept: the
		// draw it asks for reads again, so the list ends as the folder is
		if (!list && !this.reading.has(scene.path)) {
			const key = this.key, path = scene.path;
			this.reading.set(path, false);
			void snapshotsOf(plugin, scene).then((got): Snapshot[] | null => got, (): Snapshot[] | null => null /* none to show */).then((got) => {
				const stale = this.reading.get(path);
				this.reading.delete(path);
				if (got && !stale) this.snaps.set(path, got);
				if ((got || stale) && this.key === key) this.again();
			});
		}
		const head = el.createDiv({ cls: 'binders-inspector-heading' });
		head.createSpan({ text: 'Snapshots' });
		if (!ro) {
			const b = head.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': 'Take a snapshot', role: 'button', tabindex: '0' } });
			b.dataset.field = 'take';
			setIcon(b, 'camera');
			const go = (): void => { void take(plugin, [scene]); };
			b.addEventListener('click', go);
			b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
		}
		const rows = el.createDiv({ cls: 'binders-inspector-list' });
		for (const s of list ?? []) {
			const row = rows.createDiv({ cls: 'tree-item' }).createDiv({ cls: 'tree-item-self is-clickable', attr: { tabindex: '0', role: 'button' } });
			row.dataset.field = `snapshot:${s.file.name}`;
			row.createDiv({ cls: 'tree-item-inner', text: s.title || whenShort(s.taken) });
			row.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: s.title ? whenShort(s.taken) : wordsLabel(wordsIn(this.plugin, s.body)) });
			// (the dialog the note's menu opens, on this one: what's compared, brought back and named is there)
			const open = () => new SnapshotsModal(plugin, scene, s.file).open();
			row.addEventListener('click', open);
			row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
		}
		if (list && !list.length) rows.createDiv({ cls: 'binders-inspector-none binders-inspector-hint', text: 'None yet' });
	}

	/** A folder's own snapshots (and the binder's own), newest first: read from the names of their files, so there is
	    nothing to wait for. Those of the folders it is in are in the dialog, which a row opens. */
	private folderSnapshots(el: HTMLElement, folder: TFolder, ro: boolean): void {
		const plugin = this.plugin, all = folderSnapshots(plugin, folder);
		const mine = plugin.binders.binderOf(folder)?.folder === folder ? '' : folder.path.slice((plugin.binders.binderOf(folder)?.folder.path.length ?? 0) + 1);
		const list = all.filter((s) => s.of === mine);
		const head = el.createDiv({ cls: 'binders-inspector-heading' });
		head.createSpan({ text: 'Snapshots' });
		if (!ro) {
			const b = head.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': 'Take a snapshot', role: 'button', tabindex: '0' } });
			b.dataset.field = 'take';
			setIcon(b, 'camera');
			const go = (): void => { void takeFolder(plugin, folder); };
			b.addEventListener('click', go);
			b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
		}
		const rows = el.createDiv({ cls: 'binders-inspector-list' });
		for (const s of list.slice(0, 50)) {
			const row = rows.createDiv({ cls: 'tree-item' }).createDiv({ cls: 'tree-item-self is-clickable', attr: { tabindex: '0', role: 'button' } });
			row.dataset.field = `snapshot:${s.file.name}`;
			row.createDiv({ cls: 'tree-item-inner', text: s.title || whenShort(s.taken) });
			if (s.title) row.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: whenShort(s.taken) });
			const open = () => new FolderSnapshotsModal(plugin, folder, s.file).open();
			row.addEventListener('click', open);
			row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
		}
		if (list.length > 50 || all.length > list.length) {
			const more = rows.createDiv({ cls: 'tree-item' }).createDiv({ cls: 'tree-item-self is-clickable binders-inspector-hint', attr: { tabindex: '0', role: 'button' }, text: list.length > 50 ? `All ${list.length.toLocaleString()}...` : 'Those of the folders it is in...' });
			more.dataset.field = 'snapshots:all';
			const open = () => new FolderSnapshotsModal(plugin, folder).open();
			more.addEventListener('click', open);
			more.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
		}
		if (!all.length) rows.createDiv({ cls: 'binders-inspector-none binders-inspector-hint', text: 'None yet' });
	}

	/** An edit ended: what waited for it is drawn now. */
	private editing(on: boolean): void {
		if (on || !this.stale) return;
		this.el.win.setTimeout(() => { if (this.stale && !editingIn(this.el)) { this.stale = false; this.again(); } }, 0);
	}
}
