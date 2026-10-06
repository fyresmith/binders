import { FileSystemAdapter, ItemView, Scope, type WorkspaceLeaf } from 'obsidian';
import type BindersPlugin from '../main';
import { commitAll, commitFocused, editingIn } from '../view/edit';
import { Follow, type Target } from './follow';
import { ScenePane } from './scene-pane';

/* The inspector: a view in the sidebar, as Outline and Backlinks are, that shows what the writer has in hand in the
   tab they are in (scene-pane.ts) and follows it (follow.ts). The contents of the book are a view of their own
   (contents-pane.ts). The maintainer chose two views over one with both in it (2026-10-05): the two can be in sight
   together or apart, in either sidebar, and a later thing is a view of its own, not another button in this one. */

export const INSPECTOR_VIEW = 'binders-inspector';
export const INSPECTOR_ICON = 'sticky-note';

/** A sidebar view that follows the workspace: told what the writer is on, as it changes. */
export abstract class FollowingView extends ItemView {
	constructor(leaf: WorkspaceLeaf, protected plugin: BindersPlugin, protected follow: Follow) {
		super(leaf);
		// Mod-Enter saves a synopsis or the notes, as in the binder view (Obsidian's own Mod-Enter would take it)
		this.scope = new Scope(this.app.scope);
		this.scope.register(['Mod'], 'Enter', () => !commitFocused());
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.contentEl.empty();
		this.build();
		this.registerEvent(this.follow.on('target', (t: Target) => this.turn(t)));
		this.follow.look();
		// What's typed in a field here is written on every way out, as the binder view writes its own (BinderView's
		// `onOpen` has the reasons): the page hidden or going, and before a quit closes the window. As the page itself
		// goes on a computer nothing is started: a write cut off between its two steps would leave the note empty.
		let leaving = false;
		const away = () => { if (!leaving) void commitAll(this.contentEl, true); };
		this.registerDomEvent(this.contentEl.doc, 'visibilitychange', () => { if (this.contentEl.doc.visibilityState === 'hidden') away(); });
		this.registerDomEvent(this.contentEl.win, 'pagehide', (e) => {
			if (e.isTrusted && this.app.vault.adapter instanceof FileSystemAdapter) { leaving = true; window.setTimeout(() => { leaving = false; }, 0); }
			away();
		});
		this.registerEvent(this.app.workspace.on('quit', (tasks) => { if (editingIn(this.contentEl)) tasks.addPromise(commitAll(this.contentEl, true).then((): void => {})); }));
	}

	/** The view closed (its tab, the plugin turned off): what's typed in it is written first. */
	async onClose(): Promise<void> {
		await commitAll(this.contentEl);
		await super.onClose();
	}

	protected abstract build(): void;
	protected abstract turn(t: Target): void;
}

/** The inspector (`binders-inspector`). */
export class InspectorView extends FollowingView {
	private pane: ScenePane | null = null;
	getViewType(): string { return INSPECTOR_VIEW; }
	getDisplayText(): string { return 'Inspector'; }
	getIcon(): string { return INSPECTOR_ICON; }
	protected build(): void { this.contentEl.addClass('binders-inspector-view'); this.pane = new ScenePane(this.contentEl, this.plugin, this.follow, this); }
	protected turn(t: Target): void { this.pane?.show(t); }
}

/** Shows a sidebar view: the one there is, or a new tab in the right sidebar. (On a phone this opens the drawer.) */
export async function showSide(plugin: BindersPlugin, type: string): Promise<void> {
	const ws = plugin.app.workspace;
	let leaf = ws.getLeavesOfType(type)[0] ?? null;
	if (!leaf) { leaf = ws.getRightLeaf(false); await leaf?.setViewState({ type, active: true }); }
	if (leaf) await ws.revealLeaf(leaf);
}

/** Registers the inspector and its command. (Its tab is put in the sidebar with a binder view: place.ts.) */
export function installInspector(plugin: BindersPlugin): Follow {
	const follow = new Follow(plugin);
	plugin.registerView(INSPECTOR_VIEW, (leaf) => new InspectorView(leaf, plugin, follow));
	plugin.addCommand({ id: 'show-inspector', name: 'Show inspector', icon: INSPECTOR_ICON, callback: () => void showSide(plugin, INSPECTOR_VIEW) });
	return follow;
}
