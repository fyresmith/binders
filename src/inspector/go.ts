import { Keymap, TFile, TFolder, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import type { BinderView } from '../view/BinderView';

/* Going to a note or folder from a pane in the sidebar (the contents, the revision tasks): in the binder view the
   writer is in, in the mode it is in, if there is one; else the item opens. One function for every pane that lists
   things in the book. */

/** `view`: the binder view the writer was in, if any (the pane's `Target.view` for this binder). `leave`: called when
    the view has been gone to, for a pane that is a drawer over it (a phone) to get out of the way. */
export async function goToItem(plugin: BindersPlugin, binder: Binder, view: BinderView | null, item: TAbstractFile, newLeaf: ReturnType<typeof Keymap.isModEvent>, leave: () => void = () => undefined): Promise<void> {
	const ws = plugin.app.workspace;
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
	leave();
}
