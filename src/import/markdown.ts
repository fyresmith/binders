/* Markdown the importers write (src/import/). Pure. */

/** Prose as Markdown that reads back as the same prose. Only what Obsidian would take for markup is escaped, where
    it would: a full stop, a dash or a bracket in a sentence is left as it was typed, so the note's text is the
    writer's, without a backslash after every sentence. What is escaped:
      anywhere: `\`, `*`, a backtick, `[` (a link, an embed, a footnote, a task), `$` (math), `_` unless it is
        inside a word, `<` before what could be a tag or a comment, `&` before what reads as an entity, `#` before
        a word (a tag), and `~~`, `==`, `%%` (struck, highlighted, a comment);
      at the start of a line: `#` and `>` (a heading, a quote), `-` or `+` and "1." or "1)" before a space (a list),
        and a line of nothing but dashes, equals signs, underscores or stars (a rule, or a heading under a line).
    A block id at a line's end (`^name`) is not escaped: it is the block id it was when export kept it. */
export const escapeMarkdown = (text: string): string => text
	// (what comes before a character is asked of the text, not of the pattern: an iPhone before iOS 16.4 can't look behind)
	.replace(/[\\*`[$]|_|<(?=[A-Za-z/!?])|&(?=#?\w+;)|#(?=[^\s#])|[~=%]/gu, (c, at: number, all: string) => {
		const before = all[at - 1] ?? '', after = all[at + 1] ?? '';
		if (c === '_') return /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after) ? c : '\\_';
		return /[~=%]/.test(c) && before !== c && after !== c ? c : `\\${c}`;
	})
	.replace(/^([ \t]*)(#+(?=\s|$)|>|[-+](?=\s|$))/gm, '$1\\$2')
	.replace(/^([ \t]*\d+)([.)])(?=\s|$)/gm, '$1\\$2')
	.replace(/^([ \t]*)([-=_])(?=[-=_ \t]*$)/gm, '$1\\$2');
