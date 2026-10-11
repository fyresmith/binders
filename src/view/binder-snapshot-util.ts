import type BindersPlugin from '../main';
import type { FolderSnapshot } from '../binder-snapshots';
import { commitAll } from './edit';
import { say, whenIn } from './snapshots';

/* The small things the snapshot screens of a folder or binder share (binder-snapshots.ts, bring-back.ts). */

export const tell = (e: unknown) => { say(e instanceof Error ? e.message.replace(/^E[A-Z]+: /, '') : typeof e === 'string' ? e : 'That didn’t work.'); };
export const count = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const dirOf = (path: string): string => { const p = path.replace(/\/$/, ''), i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
export const nameOf = (path: string): string => path.replace(/\/$/, '').slice(dirOf(path).length).replace(/\.md$/i, '');
export const quoted = (s: FolderSnapshot) => (s.title ? `“${s.title}”` : `the snapshot from ${whenIn(s.taken)}`);

/** A synopsis, a title or a cell being typed in, in any window: saved, as the views save them, so that it is in
    whatever is read next. */
export async function commitFields(plugin: BindersPlugin): Promise<void> {
	const docs = new Set<Document>([activeDocument]);
	plugin.app.workspace.iterateAllLeaves((l) => { docs.add(l.view.containerEl.doc); });
	for (const d of docs) await commitAll(d.body, true);
}
