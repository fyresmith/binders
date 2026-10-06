import { TFile } from 'obsidian';
import { isPictureName } from '../export/picture';
import { rolesOf, type Played } from '../inspector/roles';
import type BindersPlugin from '../main';
import { inBook, opensSection, readWords, type BookRead, type Found } from './book-words';
import { countWords } from './words';

/* The views' word counter: each note counted once per change and kept, both ways of counting (words.ts says which
   there are), so a view asks as often as it likes and never waits on the disk. With "Count words as the exported
   book does" on, a note's count is its words in the book: what it embeds is found as export finds it, and the title
   of the chapter it opens is left to export's headings (book-words.ts). */

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** Every counter there is, held weakly (a view's counter goes with its view), and the plugins whose vault is listened
    to: a note embedded in another isn't the view's own, so nothing else tells the view it was written. */
const counters = new Set<WeakRef<WordCounter>>(), listening = new WeakSet<BindersPlugin>();

/** A note counted, the way the setting said when it was read: as the book has it (`read`), or as the status bar
    counts (`plain`). One way only: a count is made at every pause in the typing. */
interface Counted { mtime: number; read: BookRead | null; plain: number }

/** Word counts per note, cached by modification time and read in the background; `changed` runs when new counts
    arrive. */
export class WordCounter {
	/** By note, not by path: a note keeps its count when it's renamed or moved (Obsidian keeps the same file object). */
	private cache = new WeakMap<TFile, Counted>();
	private reading = new WeakSet<TFile>();
	/** The roles of a binder's notes, for the counts asked in one go (a redraw): worked out when a note that may open
	    a chapter with a title is counted, and dropped as soon as that go is over. */
	private roles = new Map<string, Map<string, Played>>();

	/** `changed` runs once counts that weren't known yet have been read. */
	constructor(private plugin: BindersPlugin, private changed: () => void) {
		counters.add(new WeakRef(this));
		if (listening.has(plugin)) return;
		listening.add(plugin);
		plugin.registerEvent(plugin.app.vault.on('modify', (f) => {
			for (const ref of counters) { const c = ref.deref(); if (!c) counters.delete(ref); else if (f instanceof TFile && c.embedded.has(f)) c.changed(); }
		}));
	}

	/** The notes found embedded in a note counted here: one of them written, and the count that has its words is asked
	    for again. */
	private embedded = new WeakSet<TFile>();

	private count(file: TFile, text: string): Counted {
		const book = this.plugin.settings.bookWords;
		return { mtime: file.stat.mtime, read: book ? readWords(text) : null, plain: book ? 0 : countWords(text) };
	}

	/** The note as last counted (while it's being read again, because it was written or the setting was changed, what
	    it had before), or null. */
	private counted(file: TFile): Counted | null {
		const c = this.cache.get(file);
		if (c && c.mtime === file.stat.mtime && !!c.read === this.plugin.settings.bookWords) return c;
		if (!this.reading.has(file)) {
			this.reading.add(file);
			void this.plugin.app.vault.cachedRead(file).then((text) => {
				this.cache.set(file, this.count(file, text));
			}, () => { /* gone: counts as unknown */ }).finally(() => { this.reading.delete(file); this.changed(); });
		}
		return c ?? null;
	}

	/** Does this note open a section of the book (a chapter, a part, a page of front or back matter)? Then a
	    level-one heading at its top is that section's title. */
	private opens(file: TFile): boolean {
		const binder = this.plugin.binders.binderOf(file);
		if (!binder) return false;
		let roles = this.roles.get(binder.folder.path);
		if (!roles) {
			if (!this.roles.size) queueMicrotask(() => this.roles.clear());
			roles = rolesOf(this.plugin, binder);
			this.roles.set(binder.folder.path, roles);
		}
		const played = roles.get(file.path);
		return !!played && opensSection(played.role);
	}

	/** A note's words in the book: with the notes it embeds, found as export finds them, and without the title of
	    the chapter it opens. */
	private book(file: TFile, read: BookRead): number {
		const app = this.plugin.app;
		const find = (target: string, image: boolean): Found => {
			const name = target.split('|')[0].trim();
			// (a part of a note, `![[Note#Heading]]`, isn't brought in: only a whole note is)
			if (/^[a-z][\w+.-]*:/i.test(name) || name.includes('#')) return null;
			const f = app.metadataCache.getFirstLinkpathDest(safeDecode(name), file.path);
			if (!f) return null;
			if (f.extension !== 'md') return isPictureName(f.name) ? 'picture' : null;
			if (image) return null;
			this.embedded.add(f);
			const c = this.counted(f);
			return c?.read ? { note: c.read } : null;
		};
		return inBook(read, (read.first === 'h1' || read.lead.length > 0) && this.opens(file), find);
	}

	/** The note's word count; while it's being read, the last known count (or null). */
	get(file: TFile): number | null {
		const c = this.counted(file);
		return !c ? null : c.read ? this.book(file, c.read) : c.plain;
	}

	/** The total for several notes, or null until all are known. */
	sum(files: TFile[]): number | null {
		let total = 0, known = true;
		for (const f of files) { const n = this.get(f); if (n == null) known = false; else total += n; }
		return known ? total : null;
	}

	/** Text typed but not saved yet (the manuscript): its count shows now, and stays until the saved note is read. */
	typed(file: TFile, text: string): void { this.cache.set(file, this.count(file, text)); }
}
