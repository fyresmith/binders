import { Platform, getLinkpath, type App, type WorkspaceLeaf } from 'obsidian';

/* A link read beside the writing: a plain click on a link in a pinned row, or in the outliner's property cells,
   opens the note in a pane beside the tab the writer is in, and the next one opens in the same pane. Public API only
   (`createLeafBySplit`, `getMostRecentLeaf`, `openFile`). A modifier, a middle or right click, and a phone, are left
   to Obsidian, as is the link's own menu. */

let side: WorkspaceLeaf | null = null;

/** Is this click one to open beside the writing (a plain left click on a phone-less screen)? */
export const plainClick = (e: MouseEvent): boolean => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !Platform.isPhone;

/** Opens the note a link names (`href` as written in the link) beside the writing, the keyboard where it was. */
export async function openBeside(app: App, href: string, sourcePath: string): Promise<void> {
	const ws = app.workspace;
	let leaf = side;
	if (!leaf || !leaf.view?.containerEl.isConnected) {
		// (beside the tab the writer is in, never a sidebar's)
		const from = ws.getMostRecentLeaf(ws.rootSplit);
		leaf = side = from ? ws.createLeafBySplit(from, 'vertical') : ws.getLeaf('split');
	}
	const file = app.metadataCache.getFirstLinkpathDest(getLinkpath(href), sourcePath);
	if (file) await leaf.openFile(file, { active: false }); else await ws.openLinkText(href, sourcePath, false);
}
