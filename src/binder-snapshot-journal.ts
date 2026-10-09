import { TFile, normalizePath, type App } from 'obsidian';
import type { Since } from './binder-snapshot-text';

/* The written plan of a snapshot being brought back whole ("Everything"): one small plain-text file at the top of
   the binder's "Snapshots" folder, written before the first item is made, renamed or moved, and marked as finished
   when the last is done. A binder has one at most: one thing is brought back at a time, and the next plan is
   written over the last. (Marked, not deleted: Binders deletes no file by itself, and the file says what the last
   bringing back did, for whoever opens it.)

   It is there so that a bringing back that was cut short (Obsidian closed, the power went) is not left half done
   without a word: the next time Binders loads, a binder whose plan isn't finished says so, and offers to finish or
   to put things back as they were (src/view/binder-snapshots.ts).

   Nothing is ever written on its word. It names two snapshots and a folder, and those are looked up among the
   snapshots the binder really has; what finishing or putting back then does is worked out again from the notes as
   they are and from the snapshot, shown on the same screen, and done by the same code as any bringing back. The
   lists in it say what the plan was, for a person who opens the file. */

export const JOURNAL = 'Bringing back.binder-journal';
export const JOURNAL_FORMAT = 1;

export interface Journal {
	journal: number;
	/** The folder being brought back: its path in the binder ("" for the binder itself). */
	of: string;
	/** The snapshot being brought back, and the one taken first of the folder as it was: their files' paths. */
	snapshot: string;
	before: string;
	/** What the snapshot is called, to say so. */
	title: string;
	/** What became of the items new since. */
	since: Since;
	started: number;
	/** When it was done, or the writer said to leave things as they are. 0 while it is under way: a plan found so
	    when Binders loads was cut short. */
	finished: number;
	/** What was to be done, in paths in the folder: for a reader. */
	plan: { made: string[]; moved: [string, string][]; written: string[] };
}

export const journalPath = (snapshots: string): string => normalizePath(`${snapshots}/${JOURNAL}`);

const stamp = (ms: number): string => (ms ? new Date(ms).toISOString() : '');

/** Writes the plan down, over the last one, and reads it back. */
export async function writeJournal(app: App, snapshots: string, j: Journal): Promise<void> {
	const path = journalPath(snapshots), there = app.vault.getAbstractFileByPath(path);
	// (the times as a person reads them, too)
	const text = JSON.stringify({ ...j, 'started at': stamp(j.started), 'finished at': stamp(j.finished) }, null, '\t') + '\n';
	if (there instanceof TFile) await app.vault.modify(there, text);
	else if (await app.vault.adapter.exists(path)) await app.vault.adapter.write(path, text);
	else await app.vault.create(path, text);
	if (await app.vault.adapter.read(path) !== text) throw new Error('The plan couldn’t be written down, so nothing was changed.');
}

/** The plan written down in a folder of snapshots, if it isn't finished: null if there is none under way (a file
    that can't be read as one is none: the next plan is written over it), 'newer' for one a newer Binders wrote,
    finished or not, which this version leaves as it is. */
export async function readJournal(app: App, snapshots: string): Promise<Journal | 'newer' | null> {
	const path = journalPath(snapshots);
	if (!(await app.vault.adapter.exists(path))) return null;
	try {
		const j = JSON.parse(await app.vault.adapter.read(path)) as Partial<Journal> | null;
		const text = (v: unknown): v is string => typeof v === 'string';
		if (j && typeof j.journal === 'number' && j.journal > JOURNAL_FORMAT) return 'newer';
		if (!j || j.journal !== JOURNAL_FORMAT || !text(j.of) || !text(j.snapshot) || !text(j.before)) return null;
		if (j.finished) return null;
		const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter(text) : []);
		const pairs = (v: unknown): [string, string][] => (Array.isArray(v) ? v.filter((x): x is [string, string] => Array.isArray(x) && x.length === 2 && text(x[0]) && text(x[1])) : []);
		return { journal: JOURNAL_FORMAT, of: j.of, snapshot: j.snapshot, before: j.before, title: text(j.title) ? j.title : '', since: j.since === 'gather' ? 'gather' : 'stay', started: typeof j.started === 'number' ? j.started : 0, finished: 0, plan: { made: list(j.plan?.made), moved: pairs(j.plan?.moved), written: list(j.plan?.written) } };
	} catch { return null; }
}

/** Marks the plan as finished: what it was for is done, or the writer said to leave things as they are. */
export async function closeJournal(app: App, snapshots: string): Promise<void> {
	const j = await readJournal(app, snapshots);
	if (j && j !== 'newer') await writeJournal(app, snapshots, { ...j, finished: Date.now() });
}
