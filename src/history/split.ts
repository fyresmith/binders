import type { Handler, SplitStep } from './types';

/* A split made by hand, in the binder's history: Undo last change takes it back (the first note back as it was, the new
   note to the trash) and Redo splits again. What a split is, and how it is taken back, is `src/scenes.ts`'s (`Split`,
   `settleSplit`): the editor's own undo works on the same splits by the same rules, and each split is settled one
   at a time, so the two never both act on one. This handler only asks scenes.ts, through `SplitHost`, and holds what a
   split made: a list, for a command that makes several notes at once. */

export interface SplitHost {
	/** Is the split in effect (to be undone) or undone (to be made again)? A split the editor has taken back is not. */
	alive(split: object, redo: boolean): boolean;
	/** Throws, with why, if the splits can't be taken back (or made again) now: nothing is changed. */
	check(splits: object[], redo: boolean): Promise<void>;
	apply(splits: object[], redo: boolean): Promise<void>;
}

export class SplitHandler implements Handler<SplitStep> {
	constructor(private host: () => SplitHost | null) {}

	private live(step: SplitStep, redo: boolean): object[] { const h = this.host(); return h ? step.items.filter((s) => h.alive(s, redo)) : []; }

	alive(step: SplitStep, redo?: boolean): boolean { return this.live(step, !!redo).length > 0; }

	async check(step: SplitStep, redo: boolean): Promise<void> { await this.host()?.check(this.live(step, redo), redo); }

	async apply(step: SplitStep, redo: boolean): Promise<void> { await this.host()?.apply(this.live(step, redo), redo); }
}
