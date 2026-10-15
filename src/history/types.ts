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

/** A rename: the item and its name before and after (a note's without ".md"). */
export interface RenameStep { kind: 'rename'; file: TAbstractFile; before: string; after: string }

/** A note or folder made by hand. `pos`: where it stands (and, taken away, where it stood). `bytes`: what a note held when
    it was made (checked before it is taken away, and what it is made again from). `kept`: a folder's note, when taken
    away. `undone`: it has been taken away, and is the one to be made again. */
export interface CreateStep { kind: 'create'; file: TAbstractFile; name: string; pos: Pos | null; bytes: ArrayBuffer | null; kept?: { note: ArrayBuffer | null }; undone?: boolean; /** a note made from a template: its text as the template has it (before {{title}} and the rest were filled), the title it was filled with and when, so that the name typed for it fills it again */ template?: { raw: string; title: string; at: number } }

/** What a delete keeps of one item that went: where it stood, its name, and what was in it byte for byte (a note: one
    file with no `rel`; a folder: its folders and files by their path in it), the objects it was (so entries about them can
    be pointed at their new selves), and, in a binder, its place in the list with the order of what was in it. */
export interface Kept {
	file: TAbstractFile; name: string; pos: Pos | null; isFolder: boolean;
	folders: string[]; files: { rel: string; bytes: ArrayBuffer }[];
	objects: { rel: string; item: TAbstractFile }[];
	rel: string | null; inner: string[];
}

/** A delete made by hand. `restored`: it has been undone, and what was kept is back. */
export interface RemoveStep { kind: 'remove'; trees: Kept[]; restored?: boolean }

/** A merge made by hand: the first note's whole file before and after, the notes merged into it, and the notes whose links
    the merge rewrote (their text before and after). `restored`: undone. `partial`: undone by bringing the merged-away notes
    back and leaving the first note's text, because it had been changed; it is not made again. */
export interface MergeStep { kind: 'merge'; first: TFile; before: ArrayBuffer; merged: ArrayBuffer; gone: Kept[]; links: { file: TFile; before: string; after: string }[]; restored?: boolean; partial?: boolean }

/** Thrown by a step's apply when the writer says no to what was asked: nothing was changed, the entry stays. */
export class Declined extends Error {}

/** A split made by hand: the splits it made (src/scenes.ts's own records: one for a split at the cursor, several for a
    command that splits a note in many places). */
export interface SplitStep { kind: 'split'; items: object[] }

/** A revision task added, or one ticked (revision/store.ts; golden rule 3, the fourth exception). `tick`: the line
    before and after, and the box set. `add`: the task's lines as made, the text appended to the note, and whether the
    note was made for it. Each is taken back only if the line is still exactly as it was left. */
export type RevisionStep =
	| { kind: 'revision'; op: 'tick'; binder: TFile; note: TFile; line: number; before: string; after: string; markAt: number; done: boolean }
	| { kind: 'revision'; op: 'add'; binder: TFile; note: TFile; lines: string; added: string; made: boolean };

/** A whole binder made by New binder: its folder, and every file it was made with, by path in it, byte for byte (what
    is under its `Snapshots` folder is Binders' own, and not kept). `undone`: taken away. */
export interface MadeStep { kind: 'made'; folder: TFolder; files: { rel: string; bytes: ArrayBuffer }[]; undone?: boolean; /** the binder note's file name when it was named like the folder (it is renamed with it: "Untitled binder.md" named in the file explorer is "Mara.md") */ ownNote?: string }

export type Step = OrderStep | PropsStep | RenameStep | CreateStep | RemoveStep | MergeStep | SplitStep | RevisionStep | MadeStep;
export type StepKind = Step['kind'];

/** One thing done by hand, in the binder whose note is `note`. `bytes`: what it keeps in memory beyond its labels
    (a folder note's text, later the text of deleted notes), counted against the history's limit. */
export interface Entry { failed?: boolean; note: TFile; label: string; at: number; steps: Step[]; bytes: number }

/** What a kind of step does. `check` looks at the vault as it is and throws (the sentence the writer is told) if the
    step can't be taken back or made again now; it changes nothing the writer would miss, and what it works out it hands
    to `apply`. Nothing is applied unless every step of the entry has passed its check. */
export interface Handler<S extends Step, P = void> {
	/** Is any of what the step is about still there? A step with nothing there is passed over. */
	alive(step: S, redo?: boolean): boolean;
	check(step: S, redo: boolean): Promise<P>;
	apply(step: S, redo: boolean, plan: P): Promise<void>;
	/** Names the new item wherever the step names the old one (an item made again is another object). */
	repoint?(step: S, from: TAbstractFile, to: TAbstractFile): void;
}

/** The handlers, one for each kind of step. */
export type Handlers = { [K in StepKind]: Handler<Extract<Step, { kind: K }>, unknown> };

/** The few things the history asks about binders. */
export interface Scope {
	binderOf(item: TAbstractFile | string): { note: TFile; folder: TFolder; problem?: string | null } | null;
	all(): { note: TFile; folder: TFolder }[];
}
