/* A stand-in for the binder store, for developing the explorer on its own. It reads binder order straight from the
   metadata cache. The real store (src/binders.ts) replaces it: delete this file then. */
import { Events, TFile, TFolder, type App, type Plugin, type TAbstractFile } from 'obsidian';
import { isBinderNote, orderChildren, readIndex, type BinderIndex } from './model';
import type { ExplorerSource } from './explorer';

export class DevExplorerSource extends Events implements ExplorerSource {
	constructor(private app: App, plugin: Plugin) {
		super();
		const fire = () => this.trigger('changed');
		plugin.registerEvent(app.metadataCache.on('changed', fire));
		plugin.registerEvent(app.metadataCache.on('resolved', fire));
		plugin.registerEvent(app.vault.on('create', fire));
		plugin.registerEvent(app.vault.on('delete', fire));
		plugin.registerEvent(app.vault.on('rename', fire));
	}

	private fm(f: TFile): unknown { return this.app.metadataCache.getFileCache(f)?.frontmatter; }

	private binderNote(folder: TFolder): TFile | null {
		for (const c of folder.children) if (c instanceof TFile && c.extension === 'md' && isBinderNote(this.fm(c))) return c;
		return null;
	}

	/** The nearest binder folder holding this folder, itself included. */
	private binderOf(folder: TFolder | null): TFolder | null {
		for (let f = folder; f; f = f.parent) if (this.binderNote(f)) return f;
		return null;
	}

	isBinderFolder(folder: TFolder): boolean { return !!this.binderNote(folder); }

	inBinder(item: TAbstractFile): boolean { return !!this.binderOf(item.parent); }

	orderedChildren(folder: TFolder): TAbstractFile[] | null {
		const binder = this.binderOf(folder), note = binder && this.binderNote(binder);
		if (!binder || !note) return null;
		let index: BinderIndex;
		try { index = readIndex(this.fm(note) as Record<string, unknown>); } catch { return null; }
		const rel = folder === binder ? '' : (binder.isRoot() ? folder.path : folder.path.slice(binder.path.length + 1)) + '/';
		const key = (c: TAbstractFile) => rel + (c instanceof TFolder ? c.name + '/' : c instanceof TFile && c.extension === 'md' ? c.basename : c.name);
		const byKey = new Map<string, TAbstractFile>(folder.children.map((c) => [key(c), c]));
		return orderChildren(index.contents, rel, [...byKey.keys()]).flatMap((k): TAbstractFile[] => { const c = byKey.get(k); return c ? [c] : []; });
	}

	isHiddenNote(file: TAbstractFile): boolean {
		if (!(file instanceof TFile) || file.extension !== 'md' || !file.parent) return false;
		if (isBinderNote(this.fm(file))) return true;
		return file.basename === file.parent.name && !!this.binderOf(file.parent);
	}
}
