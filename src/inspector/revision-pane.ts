import { Platform, setIcon, setTooltip, type ViewStateResult } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { capture } from '../revision/capture';
import type { Group, Place, Revision } from '../revision/store';
import type { Task } from '../revision/tasks';
import type { Follow, Target } from './follow';
import { FollowingView, showSide } from './views';

/* Revision: a third view for the sidebar, beside the inspector and the contents. The binder's unfinished tasks under
   the scenes they are about, in manuscript order, as Obsidian's Backlinks lists mentions under notes: a heading for
   each scene, its tasks under it, the pane's own buttons over them. The scene the writer is in is marked as the
   contents mark it. A box ticks its task (one character in the note: revision/store.ts `tick`); the rest of a row goes
   to its scene (inspector/go.ts). Optional: it is opened by its command, never put in the sidebar unasked.

   It relies on `Follow` (follow.ts) for `target` (the binder, the scene in hand), `lastBinder` and the `target` event. */

export const REVISION_VIEW = 'binders-revision';
export const REVISION_ICON = 'list-checks';
/** How long something said in the foot stays there. */
const SAID = 4500;

const keyOf = (task: Task): string => `${task.line}\n${task.raw.slice(0, task.markAt)}${task.raw.slice(task.markAt + 1)}`;

class RevisionPane {
	private list: HTMLElement;
	private foot: HTMLElement;
	private count: HTMLElement;
	private drawn = '';
	private target: Target | null = null;
	private binder: Binder | null = null;
	private toggle: HTMLElement;
	private said = '';
	private saidTimer = 0;
	/** Tasks ticked here since the scene in hand last changed: they stay in sight until it does, so a row never goes
	    from under the pointer. */
	private kept = new Set<string>();
	private keptAt: string | null = null;
	showDone = false;
	private rows = new Map<string, { group: Group; task: Task | null }>();

	constructor(parent: HTMLElement, private plugin: BindersPlugin, private follow: Follow, private rev: Revision, private owner: FollowingView, private keep: () => void) {
		const el = parent.createDiv({ cls: 'binders-revision' });
		const buttons = el.createDiv({ cls: 'nav-header' }).createDiv({ cls: 'nav-buttons-container' });
		const button = (icon: string, label: string, run: () => void): void => {
			const b = buttons.createDiv({ cls: 'clickable-icon nav-action-button', attr: { 'aria-label': label } });
			setIcon(b, icon);
			owner.registerDomEvent(b, 'click', run);
		};
		button('plus', 'Add revision task', () => { capture(plugin, false, this.binder ? { binder: this.binder, items: this.inHand() } : undefined); });
		button('arrow-up', 'Go to previous revision task', () => void rev.walk.step(-1));
		button('arrow-down', 'Go to next revision task', () => void rev.walk.step(1));
		button('file-text', 'Open revision note', () => void rev.walk.open(this.binder));
		this.list = el.createDiv({ cls: 'binders-revision-list', attr: { role: 'tree', 'aria-label': 'Revision tasks' } });
		this.foot = el.createDiv({ cls: 'binders-revision-foot' });
		this.count = this.foot.createDiv({ cls: 'binders-revision-count', attr: { 'aria-live': 'polite' } });
		// (a switch that only changes what is shown: a quiet button, lit while it is on)
		this.toggle = this.foot.createEl('button', { cls: 'clickable-icon binders-revision-done' });
		owner.registerDomEvent(this.toggle, 'click', () => { this.showDone = !this.showDone; this.keep(); this.draw(true); });
		owner.registerDomEvent(this.list, 'click', (e) => this.onClick(e));
		owner.registerDomEvent(this.list, 'keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLElement && e.target.matches('.tree-item-self')) { e.preventDefault(); e.target.click(); } });
		owner.registerEvent(rev.on('said', (text: string) => this.say(text)));
	}

	/** What the scene in hand is, for the plus button: the pane is in the sidebar, so the editor's own selection is not
	    read from here. */
	private inHand(): import('obsidian').TAbstractFile[] {
		const t = this.follow.target;
		return t.binder === this.binder && t.kind === 'items' ? t.items : [];
	}

	show(t: Target): void { this.target = t; this.draw(); }

	/** Says something in the foot for a few seconds, where a notice would cover the buttons above. */
	private say(text: string): void {
		this.said = text;
		this.count.setText(text);
		window.clearTimeout(this.saidTimer);
		this.saidTimer = window.setTimeout(() => { this.said = ''; this.draw(true); }, SAID);
		this.owner.register(() => window.clearTimeout(this.saidTimer));
	}

	private onClick(e: MouseEvent): void {
		const el = e.target instanceof HTMLElement ? e.target : null, self = el?.closest<HTMLElement>('.tree-item-self[data-key]'), row = self ? this.rows.get(self.dataset.key ?? '') : null, binder = this.binder;
		if (!el || !self || !row || !binder) return;
		if (el.matches('input.task-list-item-checkbox')) {
			const task = row.task;
			if (!task) return;
			e.preventDefault(); // (the box shows what the note says, once the note says it)
			this.kept.add(keyOf(task));
			void this.rev.tick(binder, task, !task.done);
			return;
		}
		void this.rev.walk.go(binder, row.group.place, row.task);
	}

	draw(force = false): void {
		const t = this.target, binder = t?.binder ?? this.follow.lastBinder, list = this.list;
		this.binder = binder;
		const say = (text: string, hint = '') => { const sig = `empty\n${text}\n${hint}`; if (sig === this.drawn) return; this.drawn = sig; list.empty(); this.rows.clear(); const e = list.createDiv({ cls: 'pane-empty', text }); if (hint) e.createDiv({ cls: 'binders-revision-hint', text: hint }); };
		if (!binder) { this.foot.hide(); say('No binder is open.'); return; }
		const l = this.rev.list(binder), here = t?.binder ? t.here?.path ?? null : null;
		if (here !== this.keptAt) { this.keptAt = here; this.kept.clear(); }
		const shows = (task: Task) => !task.done || this.showDone || this.kept.has(keyOf(task));
		const groups = l.groups.map((g) => ({ g, tasks: g.tasks.filter(shows) })).filter((x) => x.tasks.length);
		const foot = l.open + l.done === 0 ? '' : l.open ? `${l.open} unfinished` : 'None unfinished';
		if (!this.said && this.count.getText() !== foot) this.count.setText(foot);
		this.toggle.toggle(l.done > 0);
		this.toggle.setText(this.showDone ? 'Hide done' : `Show ${l.done} done`);
		this.toggle.toggleClass('is-active', this.showDone);
		this.foot.toggle(l.open + l.done > 0);
		if (!l.open && !l.done) { say(l.note ? 'No revision tasks.' : 'No revision tasks yet.', Platform.isMobile ? 'Add one for the scene you are in with the plus button.' : 'Add one for the scene you are in with the plus above, or the command “Add revision task”.'); return; }
		if (!groups.length) { say('Every task is done.'); return; }
		const sig = JSON.stringify([binder.note.path, here, this.showDone, this.rev.walk.current, groups.map((x) => [x.g.place.key, x.g.place.name, x.tasks.map((k) => [k.line, k.raw, k.quote])])]);
		if (sig === this.drawn && !force) return;
		this.drawn = sig;
		const top = list.scrollTop;
		list.empty();
		this.rows.clear();
		let active: HTMLElement | null = null, n = 0;
		for (const { g, tasks } of groups) {
			const p: Place = g.place, unresolved = p.kind === 'missing' || p.kind === 'outside';
			const item = list.createDiv({ cls: `binders-revision-group${unresolved ? ' is-unresolved' : ''}`, attr: { role: 'group' } });
			// what the tasks are about, as a heading over them: a click goes there
			const self = item.createDiv({ cls: 'tree-item-self is-clickable binders-revision-about', attr: { tabindex: '0', role: 'treeitem' } });
			const key = `g${n++}`;
			self.dataset.key = key;
			this.rows.set(key, { group: g, task: null });
			self.createDiv({ cls: 'tree-item-inner', text: p.name });
			if (unresolved) {
				self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: p.kind === 'missing' ? 'Not found' : 'Not in this binder' });
				if (p.kind === 'missing') setTooltip(self, `No note is named “${p.name}” now. The task is still in the revision note.`);
			}
			if (here != null && p.kind === 'item' && p.key === here) { self.addClass('is-active'); active ??= self; }
			for (const task of tasks) {
				const row = item.createDiv({ cls: `tree-item-self is-clickable binders-revision-task${task.done ? ' is-done' : ''}`, attr: { tabindex: '0', role: 'treeitem' } });
				const k = `t${n++}`;
				row.dataset.key = k;
				this.rows.set(k, { group: g, task });
				const box = row.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox', attr: { 'aria-label': task.done ? 'Mark as not done' : 'Mark as done' } });
				box.checked = task.done;
				const inner = row.createDiv({ cls: 'tree-item-inner' });
				inner.createDiv({ cls: 'binders-revision-text', text: task.text || '(no text)' });
				if (task.quote) inner.createDiv({ cls: 'binders-revision-quote', text: `“${task.quote}”` });
				if (this.rev.walk.isCurrent(binder, p, task)) { row.addClass('is-active'); active = row; }
			}
		}
		list.scrollTop = top;
		if (active && !list.matches(':hover')) {
			const r = active.getBoundingClientRect(), v = list.getBoundingClientRect();
			if (r.top < v.top) list.scrollTop -= v.top - r.top + 8; else if (r.bottom > v.bottom) list.scrollTop += r.bottom - v.bottom + 8;
		}
	}
}

/** The revision tasks (`binders-revision`). Whether finished tasks show is kept with the view. */
export class RevisionView extends FollowingView {
	private pane: RevisionPane | null = null;
	private kept = { done: false };
	constructor(leaf: ConstructorParameters<typeof FollowingView>[0], plugin: BindersPlugin, follow: Follow, private rev: Revision) { super(leaf, plugin, follow); }
	getViewType(): string { return REVISION_VIEW; }
	getDisplayText(): string { return 'Revision'; }
	getIcon(): string { return REVISION_ICON; }
	getState(): Record<string, unknown> { return { ...super.getState(), done: this.pane ? this.pane.showDone : this.kept.done }; }
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as { done?: unknown } | null;
		if (typeof s?.done === 'boolean') this.kept.done = s.done;
		if (this.pane) { this.pane.showDone = this.kept.done; this.pane.draw(true); }
		await super.setState(state, result);
	}
	protected build(): void {
		this.contentEl.addClass('binders-revision-view');
		this.pane = new RevisionPane(this.contentEl, this.plugin, this.follow, this.rev, this, () => this.app.workspace.requestSaveLayout());
		this.pane.showDone = this.kept.done;
		this.registerEvent(this.rev.on('changed', () => this.pane?.draw()));
	}
	protected turn(t: Target): void { this.pane?.show(t); }
}

/** Registers the pane and the commands. (The pane is opened by "Show revision tasks" only: not placed with the
    inspector and the contents.) */
export function installRevision(plugin: BindersPlugin, follow: Follow): void {
	const rev = plugin.revision;
	rev.walk.start();
	plugin.registerView(REVISION_VIEW, (leaf) => new RevisionView(leaf, plugin, follow, rev));
	plugin.addCommand({ id: 'show-revision', name: 'Show revision tasks', icon: REVISION_ICON, callback: () => void showSide(plugin, REVISION_VIEW) });
	// (only in a binder's view or note, or on a task the walk went to that is in a note outside the binder: where().binder
	// also remembers the last binder, which is not what is in hand)
	const here = (): boolean => !!plugin.inspect.target.binder || !!rev.walk.current;
	plugin.addCommand({ id: 'next-revision-task', name: 'Go to next revision task', icon: 'arrow-down', checkCallback: (checking) => { if (!here()) return false; if (!checking) void rev.walk.step(1); return true; } });
	plugin.addCommand({ id: 'previous-revision-task', name: 'Go to previous revision task', icon: 'arrow-up', checkCallback: (checking) => { if (!here()) return false; if (!checking) void rev.walk.step(-1); return true; } });
	plugin.addCommand({ id: 'finish-revision-task', name: 'Mark revision task done', icon: 'check', checkCallback: (checking) => { if (!here()) return false; if (!checking) void rev.walk.finish(); return true; } });
	plugin.addCommand({ id: 'open-revision-note', name: 'Open revision note', icon: 'file-text', checkCallback: (checking) => { const b = rev.walk.where().binder; if (!b || !rev.noteOf(b)) return false; if (!checking) void rev.walk.open(b); return true; } });
}
