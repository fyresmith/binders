import type { TAbstractFile, TFile, TFolder } from 'obsidian';

/* What the history keeps: an entry is one thing a writer did by hand, made of steps, each of a kind that has a handler
   (order.ts, props.ts…) to check that it can be taken back and to take it back. Nothing here touches the vault. */

/** Where an item is among its folder's: the folder (and its path then, in case it's deleted and made again), the items
    on either side, and a Longform scene's indent. */
export interface Pos { parent: TFolder; path: string; next: TAbstractFile | null; prev: TAbstractFile | null; depth?: number; at: number }

/** A folder a change emptied and took away (Ungroup): where it stood, its name, and its folder note byte for byte (null:
    it had none), which is where its synopsis and the rest of its data were. Undoing the change makes it again. */
export interface Removed { folder: TFolder; name: string; pos: Pos; note: ArrayBuffer | null }

/** A property a change by hand gave an item (a card dragged to another label's line): what it had (as written; undefined
    for none) and what it has now. A folder's is in its folder note. */
export interface PropChange { file: TAbstractFile; key: string; before: unknown; after: unknown; /** where the key stood among the note's properties before (for a property that wasn't taken away, nothing): so taking a property away and bringing it back leaves the note byte for byte */ at?: number }

/** A change to a binder's order: what it moved, from where to where, a folder it made to move them into, and a folder
    it emptied. `still`: nothing moved. */
export interface OrderStep {
	kind: 'order';
	items: { file: TAbstractFile; before: Pos; after: Pos }[];
	made?: { folder: TFolder; name: string; pos: Pos };
	removed?: Removed;
	still?: boolean;
}

/** Properties given to items by hand. `what` names them for the writer ("the synopsis"), by key. */
export interface PropsStep { kind: 'props'; changes: PropChange[]; what?: Record<string, string> }

export type Step = OrderStep | PropsStep;
export type StepKind = Step['kind'];

/** One thing done by hand, in the binder whose note is `note`. `bytes`: what it keeps in memory beyond its labels
    (a folder note's text, later the text of deleted notes), counted against the history's limit. */
export interface Entry { failed?: boolean; note: TFile; label: string; at: number; steps: Step[]; bytes: number }

/** What a kind of step does. `check` looks at the vault as it is and throws (the sentence the writer is told) if the
    step can't be taken back or made again now; it changes nothing the writer would miss, and what it works out it hands
    to `apply`. Nothing is applied unless every step of the entry has passed its check. */
export interface Handler<S extends Step, P = void> {
	/** Is any of what the step is about still there? A step with nothing there is passed over. */
	alive(step: S): boolean;
	check(step: S, redo: boolean): Promise<P>;
	apply(step: S, redo: boolean, plan: P): Promise<void>;
}

/** The handlers, one for each kind of step. */
export type Handlers = { [K in StepKind]: Handler<Extract<Step, { kind: K }>, unknown> };

/** The few things the history asks about binders. */
export interface Scope {
	binderOf(item: TAbstractFile | string): { note: TFile; folder: TFolder; problem?: string | null } | null;
	all(): { note: TFile; folder: TFolder }[];
}
