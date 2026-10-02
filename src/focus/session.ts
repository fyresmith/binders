/* Focus mode's pure parts: the day's words, where "the last line" is, and what's shown of the scene before and after.
   No Obsidian here (unit-tested in tests/focus-session.test.ts).

   A session is a day's writing in a binder, on this device: each note's word count when it was first seen that day
   (`base`) and its count now. The words written today are the sum of the differences over the binder's notes, so
   words deleted count against words written, and a note split in two, merged or renamed counts once. */

/** As kept in the vault's local storage: the day (YYYY-MM-DD, local time) and each note's [base, now] by path. */
export interface SessionData { day: string; notes: Record<string, [number, number]> }

/** The day a moment falls on, in local time. */
export function dayOf(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const inFolder = (path: string, folder: string): boolean => folder === '' || folder === '/' || path.startsWith(folder + '/');

export class Session {
	private data: SessionData;

	/** `saved`: what was kept before (anything at all: it's made whole, or dropped). */
	constructor(saved: unknown, today: string) {
		this.data = { day: today, notes: {} };
		const s = saved as Partial<SessionData> | null;
		if (!s || typeof s !== 'object' || s.day !== today || !s.notes || typeof s.notes !== 'object') return;
		for (const [path, v] of Object.entries(s.notes)) {
			if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && isFinite(v[0]) && isFinite(v[1])) this.data.notes[path] = [v[0], v[1]];
		}
	}

	get day(): string { return this.data.day; }

	/** A new day starts a new session. `hold`: not now (writing is under way: a session that runs past midnight
	    carries on until it's left). True if a new one was started. */
	roll(today: string, hold = false): boolean {
		if (today === this.data.day || hold) return false;
		this.data = { day: today, notes: {} };
		return true;
	}

	has(path: string): boolean { return path in this.data.notes; }

	/** A note's count as it is now. The first time it's seen today, `base` is what it's counted from (its count before
	    anything was typed; `now` if that isn't known). */
	see(path: string, now: number, base?: number): void {
		const n = this.data.notes[path];
		if (n) n[1] = now; else this.data.notes[path] = [base ?? now, now];
	}

	/** Net words written today in the notes under a folder (never less than none). */
	words(folder: string): number {
		let n = 0;
		for (const [path, [base, now]] of Object.entries(this.data.notes)) if (inFolder(path, folder)) n += now - base;
		return Math.max(0, n);
	}

	/** Counting starts again from here, for the notes under a folder. */
	reset(folder: string): void {
		for (const [path, v] of Object.entries(this.data.notes)) if (inFolder(path, folder)) v[0] = v[1];
	}

	/** A note or a folder renamed or moved: its counts go with it. */
	rename(from: string, to: string): void {
		for (const path of Object.keys(this.data.notes)) {
			if (path !== from && !path.startsWith(from + '/')) continue;
			const v = this.data.notes[path];
			delete this.data.notes[path];
			this.data.notes[to + path.slice(from.length)] = v;
		}
	}

	/** A note deleted: the words it had are no longer written (a folder: every note under it). */
	remove(path: string): void {
		for (const p of Object.keys(this.data.notes)) if (p === path || p.startsWith(path + '/')) this.data.notes[p][1] = 0;
	}

	toJSON(): SessionData { return { day: this.data.day, notes: { ...this.data.notes } }; }
}

const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
/** Where a note's text starts, after its properties. */
export const bodyStart = (text: string): number => FRONTMATTER.exec(text)?.[0].length ?? 0;

/** Is position `pos` on the last line of the text: is everything after the line it's on blank? (In a note a
    paragraph is one line, however it wraps, so this is "writing on at the end": in the last paragraph, or on an empty
    line after it.) */
export function atEnd(text: string, pos: number): boolean {
	const nl = text.indexOf('\n', Math.max(0, pos));
	return nl < 0 || text.slice(nl).trim() === '';
}

const WORDS = /\S+/g;
/** What's shown of the scene before (`end`: its last paragraphs) or after (its first): whole paragraphs, at most
    `paras` of them and about `words` words, always at least one. '' for a note with no text. */
export function excerpt(text: string, end: boolean, paras = 3, words = 110): string {
	const all = text.slice(bodyStart(text)).replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.replace(/^\n+|\s+$/g, '')).filter((p) => p.trim());
	if (end) all.reverse();
	const take: string[] = [];
	let n = 0;
	for (const p of all) {
		const w = p.match(WORDS)?.length ?? 0;
		if (take.length && (take.length >= paras || n + w > words)) break;
		take.push(p);
		n += w;
	}
	if (end) take.reverse();
	return take.join('\n\n');
}

/** A goal as typed: a whole number of words; '' or 0 for none; null if it isn't one. */
export function parseGoal(typed: string): number | null {
	const t = typed.trim().replace(/[,\s._]/g, '');
	if (!t) return 0;
	return /^\d{1,9}$/.test(t) ? Number(t) : null;
}
