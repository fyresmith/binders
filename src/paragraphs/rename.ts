import { TFile, type TAbstractFile } from 'obsidian';
import type BindersPlugin from '../main';
import { saveOpen } from '../scenes';
import { updatesLinks } from '../view/internals';
import { pointedAt, repointTabLinks } from './text';

/* Links in paragraphs begun with a tab follow a rename.

   Obsidian keeps links up when a note is renamed or moved, from its index. Its index reads a paragraph begun with a
   tab as code, and has no links for it: so a link there, which "Start a paragraph with a tab" shows and opens as a
   link, would be left pointing at the old name. This does for those lines what Obsidian does for every other.

   It is the one place Binders rewrites a note's text that isn't being typed in (golden rule 3 names it), so it is
   narrow on purpose:
   - only with "Start a paragraph with a tab" on, and only where Obsidian updates links: when it is set to, or, when it
     is set not to, for a rename whose plain links it did rewrite (the writer answered "Just once"; never "Do not
     update", and never when there is no plain link to show it by);
   - only notes in a binder, and in them only lines that are paragraphs begun with a tab by the text's own shape
     (text.ts) and code by Obsidian's index, never a fenced block;
   - only a link that can't have meant any other file, and of it only the note it names;
   - after Obsidian has finished its own updating of the same note, and through `vault.process`, so what was written
     to the note meanwhile isn't written over. When in doubt the link is left as it is.

   A folder renamed or moved is a rename for every file in it, all at once: those are taken together, in one pass over
   the notes (each read once), with what doesn't depend on the note worked out once for the pass. */

/** How long Obsidian is given to finish its own update of a note before that note is left alone. */
const WAIT = 8000;
/** How long a rename is given to show Obsidian rewrote links, when Obsidian is not set to do it on its own. */
const PROOF = 4000;
/** Renames that come within this of each other are followed together. */
const GATHER = 60;
/** Notes looked at before the pass lets everything else have a turn. */
const SLICE = 40;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** The last part of a path or of a link, in small letters: the name a link can be looked up by. */
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

/** A file that was renamed, and the path it had. */
interface Renamed {
	file: TFile; old: string;
	/** When the rename came: a file created after it is a newcomer, and not a rival for the link's name (#19). */
	at: number;
	/** With "Automatically update internal links" off: the links in notes' index that read the old name when the rename
	    came. Obsidian then rewrites links only when the writer answers "Just once"; the writer's answer isn't in the
	    API, so a link of those gone from the index is the proof that it was given. Undefined when Obsidian is set to
	    update, which needs none. */
	proof?: { note: TFile; link: string }[];
}

/** Starts following renames. Returns a promise of the work in hand, for whatever has to know it is done (tests). */
export function followRenames(plugin: BindersPlugin): { settled(): Promise<void> } {
	const { app } = plugin;
	let chain: Promise<void> = Promise.resolve();
	let waiting: Renamed[] = [];
	let seen: Map<string, { note: TFile; link: string }[]> | null = null;
	const on = () => plugin.settings.tabParagraphs;
	const linkName = (link: string): string => nameOf(link.split('#')[0].trim().replace(/\\/g, '/')).replace(/\.md$/, '');

	/** The notes in binders that Obsidian's index has a code section in: the only ones a tab paragraph can be in. */
	const candidates = (): TFile[] => app.vault.getMarkdownFiles().filter((f) => !!plugin.binders?.binderOf(f) && !!app.metadataCache.getFileCache(f)?.sections?.some((s) => s.type === 'code'));
	/** The lines of a note that the index calls code. */
	const codeLines = (f: TFile): ((line: number) => boolean) => {
		const code = (app.metadataCache.getFileCache(f)?.sections ?? []).filter((s) => s.type === 'code').map((s) => [s.position.start.line, s.position.end.line] as const);
		return (n) => code.some(([a, b]) => n >= a && n <= b);
	};

	/** Index links by the name they use, as they are now: taken when a rename comes, before Obsidian updates any. */
	const linksByName = (): Map<string, { note: TFile; link: string }[]> => {
		const out = new Map<string, { note: TFile; link: string }[]>();
		for (const note of app.vault.getMarkdownFiles()) {
			const c = app.metadataCache.getFileCache(note);
			for (const l of [...(c?.links ?? []), ...(c?.embeds ?? [])]) {
				const k = linkName(l.link);
				const list = out.get(k);
				if (list) list.push({ note, link: l.link }); else out.set(k, [{ note, link: l.link }]);
			}
		}
		return out;
	};
	/** Did Obsidian rewrite a link that read the renamed file's old name? (The index no longer has it in the note.) */
	const rewritten = (r: Renamed): boolean => (r.proof ?? []).some(({ note, link }) => {
		const c = app.metadataCache.getFileCache(note);
		return !app.vault.getAbstractFileByPath(note.path) || ![...(c?.links ?? []), ...(c?.embeds ?? [])].some((l) => l.link === link);
	});

	/** One pass for every rename gathered: each note that could hold such a link is read once. */
	const follow = async (batch: Renamed[]): Promise<void> => {
		if (!on()) return;
		// (a file renamed and then gone is nobody's link any more)
		let renamed = batch.filter((r) => app.vault.getAbstractFileByPath(r.file.path) === r.file);
		// Obsidian set not to update links: only a rename whose plain links it did rewrite ("Just once"), never one
		// it left alone ("Do not update"), or one with nothing of the sort to show it by
		if (renamed.some((r) => r.proof)) {
			for (let waited = 0; waited < PROOF && renamed.some((r) => r.proof && !rewritten(r)); waited += 100) await sleep(100);
			renamed = renamed.filter((r) => !r.proof || rewritten(r));
		}
		if (!renamed.length || !on()) return;
		// Worked out once for the pass: the renames by the name a link would have used, and every file in the vault by
		// its name. A link can only have meant a file whose path ends with what the link says, so only files of that
		// name need asking whether the link could have meant one of them instead.
		const byOld = new Map<string, Renamed[]>(), byName = new Map<string, TFile[]>();
		for (const r of renamed) { const k = nameOf(r.old); byOld.set(k, [...(byOld.get(k) ?? []), r]); }
		for (const f of app.vault.getFiles()) { const k = nameOf(f.path); const l = byName.get(k); if (l) l.push(f); else byName.set(k, [f]); }
		/** The renamed file a link in `source` meant, if it can have meant no other. */
		const meant = (link: string, source: string): TFile | null => {
			const name = nameOf(link.trim().replace(/\\/g, '/'));
			if (!name) return null;
			for (const key of [name, name + '.md']) {
				for (const r of byOld.get(key) ?? []) {
					// (a file made after the rename was not what the link meant when it was written)
					const others = (byName.get(key) ?? []).filter((f) => f !== r.file && f.stat.ctime < r.at - 2).map((f) => f.path);
					if (pointedAt(link, source, r.old, others)) return r.file;
				}
			}
			return null;
		};
		/** Does the index still have a link in this note that pointed at an old path? Then Obsidian has yet to rewrite it. */
		const pending = (f: TFile): boolean => {
			const c = app.metadataCache.getFileCache(f);
			return [...(c?.links ?? []), ...(c?.embeds ?? [])].some((l) => !!meant(l.link.split('#')[0], f.path));
		};
		let looked = 0;
		for (const note of candidates()) {
			if (!on()) return;
			if (++looked % SLICE === 0) await sleep(0);
			try {
				const to = (text: string, within: (line: number) => boolean) => repointTabLinks(text, (path) => {
					const file = path ? meant(path, note.path) : null;
					if (!file) return null;
					const next = app.metadataCache.fileToLinktext(file, note.path, file.extension === 'md');
					// (a name that leads somewhere else from here, or nowhere, is no improvement: leave the link)
					return app.metadataCache.getFirstLinkpathDest(next, note.path) === file ? next : null;
				}, within);
				// nothing of ours in it: not parsed, not saved, not waited for (a text with no link in it at all, or none
				// that changes, which is nearly every note)
				const now = await app.vault.cachedRead(note);
				if (!now.includes('[') || to(now, codeLines(note)) === now) continue;
				// Obsidian's own update of this note first: it goes by where its index says the links are, and a change
				// of ours before it would move them
				let waited = 0;
				for (; pending(note) && waited < WAIT; waited += 100) await sleep(100);
				if (waited >= WAIT) continue;
				// What is typed and not yet saved goes to disk first, so it is in what is rewritten. The index then reads
				// the note again, and until it has, it has nothing to say about which lines are code: wait for it.
				let indexed = false;
				const saved = await app.vault.cachedRead(note);
				const ref = app.metadataCache.on('changed', (f) => { if (f === note) indexed = true; });
				try {
					await saveOpen(app, [note]);
					if (await app.vault.cachedRead(note) !== saved) for (let i = 0; !indexed && i < WAIT / 100; i++) await sleep(100); else indexed = true;
				} finally { app.metadataCache.offref(ref); }
				if (!indexed || !on()) continue;
				const within = codeLines(note);
				await app.vault.process(note, (text) => to(text, within));
			} catch (e) { console.error('Binders: a link in a tab paragraph was left as it was', note.path, e); }
		}
	};

	plugin.registerEvent(app.vault.on('rename', (f: TAbstractFile, old: string) => {
		// (a folder's rename comes as one for each file in it as well)
		if (!(f instanceof TFile) || !on()) return;
		const first = !waiting.length;
		const auto = updatesLinks(app);
		if (!auto) seen ??= linksByName();
		waiting.push({ file: f, old, at: Date.now(), proof: !auto && seen ? (seen.get(linkName(old)) ?? []) : undefined });
		// the first of a burst starts the wait; the rest ride with it
		if (first) chain = chain.then(async () => {
			// (and a moment for the index to have the files under their new names before it is asked what to call them)
			for (let n = -1; n !== waiting.length;) { n = waiting.length; await sleep(GATHER); }
			const batch = waiting;
			waiting = [];
			seen = null;
			await follow(batch);
		}).catch(() => { /* said above */ });
	}));
	return { settled: () => chain };
}
