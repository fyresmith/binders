// Obsidian provides `@codemirror/language` to plugins at run time, as it does `state` and `view` (external in the
// bundle). Only what Binders uses is declared here, so the package needn't be installed for its types.
declare module '@codemirror/language' {
	import type { EditorState, Facet } from '@codemirror/state';
	/** A line being read, a token at a time (public API). */
	export interface StringStream { pos: number; start: number; string: string; sol(): boolean; eol(): boolean }
	/** A CodeMirror 5 style mode (public API). */
	export interface StreamParser<State> {
		name?: string;
		startState?(indentUnit: number): State;
		token(stream: StringStream, state: State): string | null;
		blankLine?(state: State, indentUnit: number): void;
		copyState?(state: State): State;
	}
	export class Language { }
	/** A language made from a stream parser; `streamParser` is the mode it was made from (public API). */
	export class StreamLanguage<State> extends Language {
		streamParser: StreamParser<State>;
		static define<State>(spec: StreamParser<State>): StreamLanguage<State>;
	}
	/** The language an editor reads its text as: the first one given wins (public API). */
	export const language: Facet<Language, Language | null>;
	interface Cursor { name: string; from: number; to: number; next(): boolean }
	/** The tree the editor's language has made of the text so far (public API). */
	export function syntaxTree(state: EditorState): { length: number; cursor(): Cursor; iterate(spec: { from?: number; to?: number; enter(node: { name: string; from: number; to: number }): boolean | void }): void };
}
