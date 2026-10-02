// Obsidian provides `@codemirror/commands` to plugins at run time, as it does `state` and `view` (all three are
// external in the bundle). Only what Binders uses is declared here, so the package needn't be installed for its types.
declare module '@codemirror/commands' {
	import type { StateField } from '@codemirror/state';
	/** The state field CodeMirror's undo history lives in (public API). */
	export const historyField: StateField<unknown>;
}
