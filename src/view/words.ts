import type { App, TFile } from 'obsidian';

/* Word counts for the binder views. Counting is pure (unit-tested); the counter caches per note by modification time and
   reads notes in the background, so a view never waits on the disk. */

// As Obsidian's own word count (its status bar) counts, so the numbers agree: a word is a run of letters, hyphens and
// apostrophes, or a number (with , or . inside); CJK characters count one each. Properties don't count.
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const WORD = new RegExp(`(?:[0-9]+(?:[,.][0-9]+)*|(?![${CJK}])[\\-'’\\p{L}\\p{M}])+|[${CJK}]`, 'gu');

/** Words in a note's body, as Obsidian counts them. */
export function countWords(text: string): number {
	const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
	return body.match(WORD)?.length ?? 0;
}

/** "1,234 words", "1 word". */
export function wordsLabel(n: number): string {
	return `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
}

/** Word counts per note, cached by modification time and read in the background; `changed` runs when new counts
    arrive. */
export class WordCounter {
	/** By note, not by path: a note keeps its count when it's renamed or moved (Obsidian keeps the same file object). */
	private cache = new WeakMap<TFile, { mtime: number; n: number }>();
	private reading = new WeakSet<TFile>();

	/** `changed` runs once counts that weren't known yet have been read. */
	constructor(private app: App, private changed: () => void) {}

	/** The note's word count; while it's being read, the last known count (or null). */
	get(file: TFile): number | null {
		const c = this.cache.get(file);
		if (c && c.mtime === file.stat.mtime) return c.n;
		if (!this.reading.has(file)) {
			this.reading.add(file);
			void this.app.vault.cachedRead(file).then((text) => {
				this.cache.set(file, { mtime: file.stat.mtime, n: countWords(text) });
			}, () => { /* gone: counts as unknown */ }).finally(() => { this.reading.delete(file); this.changed(); });
		}
		return c ? c.n : null;
	}

	/** The total for several notes, or null until all are known. */
	sum(files: TFile[]): number | null {
		let total = 0, known = true;
		for (const f of files) { const n = this.get(f); if (n == null) known = false; else total += n; }
		return known ? total : null;
	}

	/** Text typed but not saved yet (the manuscript): its count shows now, and stays until the saved note is read. */
	typed(file: TFile, text: string): void { this.cache.set(file, { mtime: file.stat.mtime, n: countWords(text) }); }
}
