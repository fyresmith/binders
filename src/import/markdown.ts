/* Markdown the importers write (src/import/). Pure. */

import type { Run } from './doc';

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

/** A paragraph's runs as Markdown that reads back as the same words, formatted. Runs that are alike join first. A
    space at the edge of a run stays outside its marks (`*a *` is no italic). Text is escaped where Obsidian would take
    it for markup, with the rules for the start of a line applied only to the first piece. `note` gives a footnote's
    Markdown by its index: it comes in place, as `^[...]`. */
export function runsToMarkdown(runs: readonly Run[], note: (index: number) => string, inNote = false): string {
	const pieces: string[] = [];
	let first = true;
	const text = (s: string): string => {
		const escaped = escapeMarkdown((first ? '' : '\u0001') + s);
		let t = escaped.startsWith('\u0001') ? escaped.slice(1) : escaped;
		if (inNote) t = t.replace(/\]/g, '\\]');
		first = false;
		return t;
	};
	const joined: Run[] = [];
	for (const r of runs) {
		const last = joined[joined.length - 1];
		if (r.kind === 'text' && last && last.kind === 'text' && last.b === r.b && last.i === r.i && last.s === r.s && last.href === r.href) joined[joined.length - 1] = { ...last, text: last.text + r.text };
		else joined.push(r);
	}
	for (const r of joined) {
		if (r.kind === 'br') { pieces.push('  \n'); first = true; continue; }
		if (r.kind === 'note') { pieces.push(`^[${note(r.note).replace(/\n+/g, ' ').trim()}]`); first = false; continue; }
		if (r.kind !== 'text') continue;
		const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text) ?? [r.text, '', r.text, ''];
		if (!m[2]) { pieces.push(r.text); continue; }
		const mark = `${r.s ? '~~' : ''}${r.b && r.i ? '***' : r.b ? '**' : r.i ? '*' : ''}`, close = [...mark].reverse().join('');
		let body = `${mark}${text(m[2])}${close}`;
		if (r.href) body = `[${body.replace(/\]/g, '\\]')}](${r.href.replace(/[() ]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)})`;
		pieces.push(m[1] + body + m[3]);
	}
	return pieces.join('');
}
