import type BindersPlugin from '../main';
import { VIEW_TYPE } from '../view/BinderView';
import { CONTENTS_VIEW } from './contents-pane';
import { INSPECTOR_VIEW } from './views';

/* The inspector's and the contents' tabs, put in the right sidebar whenever a binder view is open (the maintainer,
   2026-10-05: "the contents and inspector tab should be automatically included in the right tabs when a binder is
   open"). Put there as Obsidian's own sidebar views put theirs: among the sidebar's tabs, the sidebar not opened, the
   tab not brought to the front, and never a second one where there is one already, wherever the writer has moved it.
   They stay when the last binder view closes, as Outline stays with no note open. A writer who closes one gets it
   back the next time a binder view opens, unless "Show the inspector and contents with a binder" is off. */

let placing: Promise<void> = Promise.resolve();

/** Called when a binder view opens, and once the layout is ready (a binder view restored in a tab not yet shown
    hasn't opened, and still counts). One at a time: two views opening together add one tab each, not two. */
export function placeSide(plugin: BindersPlugin): void {
	const ws = plugin.app.workspace;
	ws.onLayoutReady(() => {
		placing = placing.then(async () => {
			if (!plugin.settings.sidePanes || !ws.getLeavesOfType(VIEW_TYPE).length) return;
			// (the contents first: over or before the inspector, as a book's contents come before its pages)
			for (const type of [CONTENTS_VIEW, INSPECTOR_VIEW]) {
				if (ws.getLeavesOfType(type).length) continue;
				await ws.getRightLeaf(false)?.setViewState({ type, active: false });
			}
		}).catch((e) => { console.error('Binders: the inspector and contents couldn’t be added to the sidebar', e); });
	});
}
