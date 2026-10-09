/* Undocumented: the state of Obsidian's Markdown mode (HyperMD, a CodeMirror 5 mode run as a stream language). This
   module and language.ts are the only places Binders touches it; what is relied on is checked in `wrapMode()` and
   listed in docs/dev/internals.md.

   Markdown reads a line that starts with a tab, or four spaces, as code, and Obsidian's editor has no setting for
   that (`indentedCode: true` is written into its mode; turning the option off there only takes the code font away,
   the line is still one token with nothing inside it read). So the mode is wrapped: a line's first token is its
   leading white space, after which the mode has noted how far the line is indented and not yet decided what the line
   is. Told there that the indent makes no difference, it reads the line as it reads any paragraph: emphasis, links,
   spell-check. The text is untouched: this changes how the editor reads it, never what is in it.

   A line that is white space and nothing else yet (Tab on an empty line, or the tab Enter carries on from the
   paragraph above) is a blank line to the mode, which names nothing in it; Obsidian then draws the tab as a level
   of a list, a guide line down it, until the first letter makes the line a paragraph and the tab changes width. So
   such a line is marked as well, exactly where a letter after the white space would make it a tab paragraph: the
   mode itself is asked, on a copy of its state, with the line and a letter. Only the name is given: to the mode
   the line stays blank.

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
export interface Stream { pos: number; string?: string; tabSize?: number; indentUnit?: number; sol(): boolean; eol(): boolean }
/** A mode, as far as this goes. */
export interface Mode<S> { token(stream: Stream, state: S): string | null; startState?(indentUnit: number): S; copyState?(state: S): S }

/** The token class that marks a line read as a paragraph because of this (`line-` makes it the line's class). */
export const TAB_LINE = 'binders-tab-paragraph';
/** And one whose indent is spaces, or has spaces in it. */
export const SPACE_LINE = 'binders-space-indent';
/** Obsidian's token for indented code. */
const CODE_INDENT = 'hmd-indented-code';

/** The mode with a line begun by a tab read as a paragraph, or null where the mode isn't the one known here (then
    nothing is changed: such lines stay code, as Obsidian has them). */
export function wrapMode<S extends ModeState, M extends Mode<S>>(mode: M | null | undefined): M | null {
	try {
		const probe = mode && typeof mode.token === 'function' && typeof mode.startState === 'function' ? mode.startState(4) : null;
		if (!mode || !probe || typeof probe.indentation !== 'number' || probe.list !== false || !('quote' in probe)) return null;
		// the white space a line starts with was just read, and nothing decided yet; not in a list or a quote
		const begun = (stream: Stream, state: S): boolean => stream.pos > 0 && state.indentationDiff === null && (state.indentation ?? 0) >= 4 && state.list === false && !state.quote && !stream.eol();
		// The white space keeps the name Obsidian gives indented code, and only it: by that name Obsidian leaves
		// the line's wrapped lines at the margin, where it hangs any other indented line's under the indent.
		// (and a line whose indent has spaces in it says so, for the stylesheet: spaces are spread to fill the indent)
		const named = (style: string | null, stream: Stream): string => `${style ?? ''} ${CODE_INDENT} line-${TAB_LINE}${(stream.string ?? '').slice(0, stream.pos).includes(' ') ? ` line-${SPACE_LINE}` : ''}`.trim();
		/** A line of white space only, about to be read: would it be a tab paragraph with a letter after it? The mode
		    says, reading that on a copy of its state. Where it can't be asked (no way to copy its state, or a line
		    that can't be made again), no: the line is left as Obsidian has it. */
		const wouldBegin = (stream: Stream, state: S): boolean => {
			try {
				const text = stream.string, Line = stream.constructor as (new (text: string, tabSize?: number, indentUnit?: number) => Stream) | undefined;
				if (typeof text !== 'string' || !/^[ \t]+$/.test(text) || (text.length < 4 && !text.includes('\t'))) return false;
				if (typeof mode.copyState !== 'function' || typeof Line !== 'function' || (Line as unknown) === Object) return false;
				const line = new Line(text + 'x', stream.tabSize, stream.indentUnit), copy = mode.copyState(state);
				if (typeof line.sol !== 'function' || !line.sol() || copy === state) return false;
				mode.token(line, copy);
				return begun(line, copy);
			} catch { return false; }
		};
		const token = (stream: Stream, state: S): string | null => {
			const first = stream.sol();
			// (asked before the line is read: the mode forgets a quote at a blank line)
			const blank = first && wouldBegin(stream, state);
			const style = mode.token(stream, state);
			if (first && begun(stream, state)) {
				state.indentationDiff = 0;
				return named(style, stream);
			}
			return blank && stream.eol() ? named(style, stream) : style;
		};
		return { ...mode, token };
	} catch { return null; }
}
