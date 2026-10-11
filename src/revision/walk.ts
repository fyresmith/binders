import { MarkdownView, Notice, Platform, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import { goToItem } from '../inspector/go';
import type BindersPlugin from '../main';
import type { BinderView } from '../view/BinderView';
import type { Place, Revision } from './store';
import type { Task } from './tasks';

/* The walk: through a binder's unfinished revision tasks in manuscript order ("Go to next revision task", "Go to
   previous revision task"), from the one it is on or from the scene in hand; "Mark revision task done" ticks the one
   it is on. A task about two scenes is a stop at each. The walk is on a task for as long as the writer stays with its
   scene: once they are in another, the next step starts from where they are.

   What it relies on in the inspector's `Follow` (inspector/follow.ts), and nothing more: `target` (`binder`, `here`,
   `items`, `view`), `lastBinder`, and the `target` event. */

/** One stop of the walk: a task, at one of the scenes it is about. */
export interface Stop { place: Place; task: Task }

const same = (a: Task | null, b: Task | null): boolean => !!a && !!b && a.line === b.line && a.raw === b.raw;

export class Walk {
	/** The task the walk is on, and at which of its scenes (`place`: the key of the place). */
	current: { binder: string; task: Task; place: string } | null = null;
	private went = 0;

	constructor(private plugin: BindersPlugin, private rev: Revision) {}

	/** Starts following where the writer is (once the inspector's `Follow` exists). */
	start(): void {
		const plugin = this.plugin;
		plugin.registerEvent(plugin.inspect.on('target', (t: { binder: unknown; here: TAbstractFile | null }) => {
			const c = this.current, here = t.binder ? t.here?.path : null;
			if (Date.now() - this.went < 1500) return; // (on its way there)
			if (!c || !here || !c.place || c.place.startsWith('?') || c.place.startsWith('!')) return;
			if (here !== c.place && !here.startsWith(c.place + '/')) { this.current = null; this.rev.trigger('changed'); }
		}));
	}

	/** The binder the writer is in, and what they have in hand there. */
	where(): { binder: Binder | null; item: TAbstractFile | null; view: BinderView | null } {
		const t = this.plugin.inspect.target, binder = t.binder ?? this.plugin.inspect.lastBinder;
		return { binder, item: t.binder ? t.here ?? t.items[0] ?? null : null, view: t.binder ? t.view : null };
	}

	/** The unfinished tasks in the order they are visited. */
	stops(binder: Binder): Stop[] { return this.rev.list(binder).groups.flatMap((g) => g.tasks.filter((t) => !t.done).map((task) => ({ place: g.place, task }))); }

	isCurrent(binder: Binder, place: Place, task: Task): boolean {
		const c = this.current;
		return !!c && c.binder === binder.note.path && c.place === place.key && same(c.task, task);
	}

	/** Goes to what a task is about: in the binder view the writer is in, in the mode it is in; else the note opens. */
	async go(binder: Binder, place: Place, task: Task | null): Promise<void> {
		const plugin = this.plugin, ws = plugin.app.workspace;
		const mark = () => { if (task) { this.went = Date.now(); this.current = { binder: binder.note.path, task, place: place.key }; this.rev.trigger('changed'); } };
		mark();
		if (place.kind === 'missing') { this.rev.tell(`There is no note “${place.name}”. The task is still in the revision note.`); return; }
		const item = place.item;
		if (!item) return;
		const t = plugin.inspect.target, view = t.binder === binder ? t.view : null;
		await goToItem(plugin, binder, place.kind === 'outside' ? null : view, item, false);
		// (on a phone the drawer this is in covers what was gone to)
		if (Platform.isPhone) ws.rightSplit.collapse();
		mark();
	}

	/** "Go to next revision task" and "Go to previous": the unfinished ones, in manuscript order, from the one the
	    walk is on, or from the scene in hand. */
	async step(delta: 1 | -1): Promise<void> {
		const { binder, item } = this.where();
		if (!binder) return;
		const stops = this.stops(binder);
		if (!stops.length) { this.rev.tell('No unfinished revision tasks.'); return; }
		const cur = this.current;
		let i = cur && cur.binder === binder.note.path ? stops.findIndex((s) => s.place.key === cur.place && same(s.task, cur.task)) : -1, next: number;
		if (i >= 0) next = i + delta;
		else {
			// (from where the writer is: the first task at or after the scene in hand, or the last one before it)
			const here = item ? this.rev.order(binder).get(item.path) ?? -1 : -1;
			i = stops.findIndex((s) => s.place.at >= here);
			next = delta > 0 ? (i < 0 ? stops.length : i) : (i < 0 ? stops.length : i) - 1;
		}
		if (next < 0 || next >= stops.length) { this.rev.tell(delta > 0 ? 'No unfinished revision tasks after this one.' : 'No unfinished revision tasks before this one.'); return; }
		const s = stops[next];
		await this.go(binder, s.place, s.task);
		// (with the pane in sight, the row it is on is marked; else it is said, with where it is in the walk)
		if (!this.rev.paneShown()) new Notice(`${s.place.kind === 'book' ? '' : `${s.place.name}: `}${s.task.text}\n${next + 1} of ${stops.length}`, 8000);
	}

	/** "Mark revision task done": the one the walk is on. The walk stays where it was, so the next step goes on from
	    this one's place. */
	async finish(): Promise<void> {
		const { binder } = this.where(), cur = this.current;
		if (!binder || !cur || cur.binder !== binder.note.path) { this.rev.tell('Go to a revision task first.'); return; }
		const line = await this.rev.tick(binder, cur.task, true);
		if (line === null) return;
		this.current = { ...cur, task: { ...cur.task, raw: line, done: true } };
		this.rev.trigger('changed');
	}

	/** Opens the revision note in a tab, as a note. */
	async open(binder: Binder | null): Promise<void> {
		const note = binder ? this.rev.noteOf(binder) : null;
		if (!note) { this.rev.tell('This binder has no revision note yet. It is made with the first task.'); return; }
		const ws = this.plugin.app.workspace, there = ws.getLeavesOfType('markdown').find((l) => l.view instanceof MarkdownView && l.view.file === note);
		if (there) { ws.setActiveLeaf(there, { focus: true }); return; }
		await ws.getLeaf('tab').openFile(note);
	}
}

