import type { App, TFile } from 'obsidian';
import type { Binder } from '../binders';
import type { Revision } from '../revision/store';
import { setDone } from '../revision/tasks';
import type { Handler, RevisionStep } from './types';

/* Revision tasks, and taking them back (golden rule 3, the fourth exception). Exact, not tolerant: a tick is undone
   (or made again) only if the line is still exactly as the step left it, and one box is the one character changed; an
   added task is taken out only if it is still at the note's end exactly as it was written, and made again by adding it
   at the end once more. If the line is not what the step expects, nothing is written and the writer is told. */

/** What the handler asks of the store. */
export interface RevisionHost {
	revision(): Revision;
	binderOf(note: TFile): Binder | null;
}

export class RevisionHandler implements Handler<RevisionStep> {
	constructor(private app: App, private host: RevisionHost) {}

	alive(step: RevisionStep): boolean { return this.app.vault.getAbstractFileByPath(step.binder.path) === step.binder; }

	/** The note's text as the disk has it, with what is typed in its tab saved first. */
	private async disk(step: RevisionStep): Promise<string | null> {
		const rev = this.host.revision(), note = step.note;
		if (this.app.vault.getAbstractFileByPath(note.path) !== note) return null;
		return rev.diskText(note);
	}

	async check(step: RevisionStep, redo: boolean): Promise<void> {
		if (!this.host.binderOf(step.binder)) throw new Error('That binder is not there now.');
		const text = await this.disk(step), name = step.note.basename;
		if (step.op === 'tick') {
			const raw = redo ? step.before : step.after, want = redo ? step.done : !step.done;
			if (text === null || setDone(text, { line: step.line, raw, markAt: step.markAt }, want) === null) throw new Error(`The task in “${name}” has changed since, so it stays as it is.`);
			return;
		}
		if (redo) return; // (added again at the end, whatever is there)
		if (text === null || !step.added || !text.endsWith(step.added)) throw new Error(`The task in “${name}” has been changed or written under since, so it stays.`);
	}

	async apply(step: RevisionStep, redo: boolean): Promise<void> {
		const rev = this.host.revision(), binder = this.host.binderOf(step.binder), name = step.note.basename;
		if (!binder) return;
		if (step.op === 'tick') {
			const raw = redo ? step.before : step.after, want = redo ? step.done : !step.done;
			const wrote = await rev.tickLine(step.note, { line: step.line, raw, markAt: step.markAt }, want);
			if (!wrote) throw new Error(`The task in “${name}” has changed since, so it stays as it is.`);
			step.line = wrote.line;
			return;
		}
		if (!redo) {
			if (!(await rev.takeOut(binder, step.note, step.added))) throw new Error(`The task in “${name}” has been changed or written under since, so it stays.`);
			return;
		}
		// made again: at the end of the note (made again if the note went with it), and what it is now is what a next undo takes out
		const done = await rev.put(binder, () => step.lines);
		step.note = done.note;
		step.added = done.added;
		step.made = done.made;
	}
}
