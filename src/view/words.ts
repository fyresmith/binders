import type BindersPlugin from '../main';
import { readWords } from './book-words';

/* Word counts for the binder views. Counting is pure (unit-tested); the counter (word-counter.ts) caches per note by
   modification time and reads notes in the background, so a view never waits on the disk.

   There are two ways to count, and a setting between them ("Count words as the exported book does", on to begin
   with). On: a note's words as export has them (book-words.ts; the rule is in docs/dev/plan.md). Off: as Obsidian's
   status bar counts, which is `countWords` here. Everything that shows or uses a count asks `WordCounter` or
   `wordsIn`, so they all follow the setting together. */

// As Obsidian's own word count (its status bar) counts, so the numbers agree: a word is a run of letters, hyphens and
// apostrophes, or a number (with , or . inside); CJK characters count one each. Properties don't count.
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const WORD = new RegExp(`(?:[0-9]+(?:[,.][0-9]+)*|(?![${CJK}])[\\-'’\\p{L}\\p{M}])+|[${CJK}]`, 'gu');

/** Words in a note's body, as Obsidian's status bar counts them. */
export function countWords(text: string): number {
	const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
	return body.match(WORD)?.length ?? 0;
}

/** "1,234 words", "1 word". */
export function wordsLabel(n: number): string {
	return `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
}

/** The words of a note's own text, by the way of counting the settings say: for a count that isn't a note's place in
    a book (a snapshot, the day's words). */
export const wordsIn = (plugin: BindersPlugin, text: string): number => (plugin.settings.bookWords ? readWords(text).words : countWords(text));
