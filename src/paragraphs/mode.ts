/* Undocumented: the state of Obsidian's Markdown mode (HyperMD, a CodeMirror 5 mode run as a stream language). This
   module and language.ts are the only places Binders touches it; what is relied on is checked in `wrapMode()` and
   listed in docs/internals.md.

   Markdown reads a line that starts with a tab, or four spaces, as code, and Obsidian's editor has no setting for
   that (`indentedCode: true` is written into its mode; turning the option off there only takes the code font away,
   the line is still one token with nothing inside it read). So the mode is wrapped: a line's first token is its
   leading white space, after which the mode has noted how far the line is indented and not yet decided what the line
   is. Told there that the indent makes no difference, it reads the line as it reads any paragraph: emphasis, links,
   spell-check. The text is untouched: this changes how the editor reads it, never what is in it.

   No imports, so the wrapping itself is unit-tested with a stand-in for the mode (tests/paragraphs.test.ts). */

/** What of the mode's state is read and set. */
export interface ModeState {
	/** Columns of white space the line starts with (a tab is four). */
	indentation?: number;
	/** That, less what a list around it accounts for: `null` from the line's start until the mode decides its kind. */
	indentationDiff?: number | null;
	/** A list the line is in (`false` for none): there an indent is the list's, and is left alone. */
	list?: unknown;
	/** How deep in quotes the line is. */
	quote?: unknown;
}
/** What of a line being read is used. */
export interface Stream { pos: number; sol(): boolean; eol(): boolean }
/** A mode, as far as this goes. */
export interface Mode<S> { token(stream: Stream, state: S): string | null; startState?(indentUnit: number): S }

/** The token class that marks a line read as a paragraph because of this (`line-` makes it the line's class). */
export const TAB_LINE = 'binders-tab-paragraph';
/** Obsidian's token for indented code. */
const CODE_INDENT = 'hmd-indented-code';

/** The mode with a line begun by a tab read as a paragraph, or null where the mode isn't the one known here (then
    nothing is changed: such lines stay code, as Obsidian has them). */
export function wrapMode<S extends ModeState, M extends Mode<S>>(mode: M | null | undefined): M | null {
	try {
		const probe = mode && typeof mode.token === 'function' && typeof mode.startState === 'function' ? mode.startState(4) : null;
		if (!mode || !probe || typeof probe.indentation !== 'number' || probe.list !== false || !('quote' in probe)) return null;
		const token = (stream: Stream, state: S): string | null => {
			const first = stream.sol();
			const style = mode.token(stream, state);
			// the white space a line starts with was just read, and nothing decided yet; not in a list or a quote
			if (first && stream.pos > 0 && state.indentationDiff === null && (state.indentation ?? 0) >= 4 && state.list === false && !state.quote && !stream.eol()) {
				state.indentationDiff = 0;
				// The white space keeps the name Obsidian gives indented code, and only it: by that name Obsidian leaves
				// the line's wrapped lines at the margin, where it hangs any other indented line's under the indent.
				return `${style ?? ''} ${CODE_INDENT} line-${TAB_LINE}`.trim();
			}
			return style;
		};
		return { ...mode, token };
	} catch { return null; }
}
