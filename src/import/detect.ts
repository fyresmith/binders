import { BARE, NUMBER, PARTLIKE, UNNUMBERED } from '../export/roles';

/* Where a manuscript's chapters, parts and scenes start, found in what its text says. Pure: it is handed the text
   as units (a heading, a paragraph, a mark) and answers with where to cut, so every rule is unit-tested
   (tests/import-detect.test.ts) and the dialog can show what was found and let the writer change it.
   The design is docs/dev/import.md, "The rules". In order:
     R0  Lines of a table of contents are no chapter's start.
     R1  Headings (Markdown's `#`; a Word style, later): the levels found are given roles.
     R2  Lines that read as titles, when headings give fewer than two chapters: "Chapter 12", "Prologue".
     R3  A short centered, bold or capital line after a page break, when R2 gives fewer than two.
     R4  Scene breaks, inside the chapters: "***" and its kind, or blank lines where those are rare.
     R5  Sanity: chapters that are mostly very short are marked doubtful.
     R6  Nothing found: the cuts are only the scene breaks, and there may be none.
   It agrees with the names export knows (export/roles.ts): a number is spelled as `titleFrom` strips it. */

export interface Unit {
	/** What it says, with the marks that made it a heading or emphasis taken off. */
	text: string;
	/** Exactly as the source has it, marks and all, when that isn't `text`. */
	raw?: string;
	/** A heading's level (1 to 6), or null. */
	heading: number | null;
	/** A page began here (a form feed; in Word a page break). */
	pageBefore: boolean;
	centered: boolean;
	/** All bold, or all capitals. */
	emphatic: boolean;
	/** No text at all. */
	empty: boolean;
	words: number;
	/** A scene break by the reader's own word (Word's "scene break" style), not by what it says. */
	marker: boolean;
	/** The blank lines before it (text), or empty paragraphs (Word). */
	gap: number;
	/** In a table of contents by its style (Word): never a chapter's start. */
	toc: boolean;
	/** Where it is in the text (a source with no offsets leaves both 0). */
	start: number;
	end: number;
}

export const wordCount = (text: string): number => text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
/** A unit with what it didn't say filled in. */
export const unit = (text: string, o: Partial<Unit> = {}): Unit => ({ text, heading: null, pageBefore: false, centered: false, emphatic: false, empty: !text.trim(), words: wordCount(text), marker: false, gap: 1, toc: false, start: 0, end: 0, ...o });

export type Level = 'part' | 'chapter' | 'scene';
export type Role = Level | 'text';
export type Signal = 'headings' | 'titles' | 'pages' | 'none';
export interface Cut {
	/** The unit it starts at. */
	at: number;
	level: Level;
	/** What it is called, as the text says it. */
	title: string;
	by: 'heading' | 'title' | 'page' | 'break';
	/** The unit is the title and not text: it becomes the name, and the text starts after it. */
	drop: boolean;
}
export interface Choices {
	/** Where chapters start; null is the best guess. */
	signal: Signal | null;
	/** A heading level's role, over the guess. */
	roles: ReadonlyMap<number, Role>;
	/** A scene break starts a new note, or stays in the text. */
	breaks: 'new' | 'keep';
}
export interface Found {
	signal: Signal;
	/** How many chapters (and parts) each way of finding them would make. */
	counts: Record<Signal, number>;
	/** Each heading level found, how many, and its role now. */
	levels: { level: number; count: number; role: Role }[];
	/** Scene breaks found among the chapters. */
	breaks: number;
	breakStyle: 'marker' | 'blank' | 'none';
	/** How many units come before the first chapter. */
	front: number;
	/** The unit that is the book's title (a lone first heading), or null. */
	book: number | null;
	/** Most of what was found is very short: they may not be chapters. */
	doubtful: boolean;
}

const RANK: Record<Level, number> = { part: 0, chapter: 1, scene: 2 };

/** A line's words with emphasis and the marks of a heading off, to be matched against what a title reads like. */
const plain = (text: string): string => text.trim().replace(/^[*_~`]+|[*_~`]+$/g, '').trim();

const NUMBERED = new RegExp(`^(?:chapter|part|book|act)\\s+${NUMBER}(?:\\.|\\s*[-–—:.)]\\s*\\S.*)?$`, 'i');
const NUMBERED_LOOSE = new RegExp(`^(?:chapter|part|book|act)\\s+${NUMBER}\\b`, 'i');
const BARE_FIGURE = new RegExp(`^${BARE}\\.?$`, 'i');
const ROMAN = /^[IVXLCDM]+\.?$/;

/** What a line reads as, by what it says alone (R2): a part, a chapter, a bare number (which also needs a place that
    says it is a title), or nothing. */
function reads(u: Unit): 'part' | 'chapter' | 'bare' | null {
	if (u.heading !== null || u.empty || isMarker(u)) return null;
	const t = plain(u.text);
	if (!t || u.words > 8 || u.words === 0) return null;
	if (NUMBERED.test(t) || ((u.centered || u.emphatic) && NUMBERED_LOOSE.test(t))) return PARTLIKE.test(t) ? 'part' : 'chapter';
	// (a full stop ends a sentence, not a title)
	if (/[.!?…]$/.test(t)) return null;
	if (UNNUMBERED.test(t.replace(/[:.]$/, ''))) return 'chapter';
	if (BARE_FIGURE.test(t) || ROMAN.test(t)) return 'bare';
	return null;
}

/** Whether a line alone reads as a chapter's or part's title (a text file often has one right above its text). */
export function readsAsTitle(text: string): boolean {
	const k = reads(unit(text, { emphatic: isCaps(text) }));
	return k === 'part' || k === 'chapter';
}

/** A mark between scenes: a few characters with no letter or digit in them, or "xxx". */
export function isMarker(u: Unit): boolean {
	if (u.marker) return true;
	if (u.heading !== null || u.empty) return false;
	const t = u.text.trim();
	if (!t) return false;
	if (/^(x{3}|o{3}|o0o)$/i.test(t)) return true;
	return t.length <= 12 && !/[\p{L}\p{N}]/u.test(t) && !/^[>|+-]$/.test(t) && !/[>|]/.test(t);
}

const isCaps = (t: string): boolean => /\p{L}/u.test(t) && t === t.toUpperCase() && t !== t.toLowerCase();

/** R0: units a contents list holds, which are no chapter's start: those the reader says are, and a run of three or
    more lines that read as chapters with fewer than 30 words between them (a contents page typed by hand). */
function contents(units: readonly Unit[]): Set<number> {
	const out = new Set<number>(units.flatMap((u, i) => (u.toc ? [i] : [])));
	const lines = units.flatMap((u, i) => (reads(u) && reads(u) !== 'bare' ? [i] : []));
	let run: number[] = [];
	const flush = () => { if (run.length >= 3) for (const i of run) out.add(i); run = []; };
	for (const i of lines) {
		if (run.length) {
			let between = 0;
			for (let j = run[run.length - 1] + 1; j < i; j++) between += units[j].words;
			if (between >= 30) flush();
		}
		run.push(i);
	}
	flush();
	return out;
}

/** The cuts and what was found (the rules above), for these units and the writer's choices. */
export function detect(units: readonly Unit[], choose: Partial<Choices> = {}): { found: Found; cuts: Cut[] } {
	const choices: Choices = { signal: null, roles: new Map(), breaks: 'new', ...choose };
	const toc = contents(units);

	// ---- R1: headings ----
	const heads = units.flatMap((u, i) => (u.heading !== null && !toc.has(i) ? [i] : []));
	const first = units.findIndex((u) => !u.empty);
	const shallow = heads.length ? Math.min(...heads.map((i) => units[i].heading ?? 6)) : 0;
	// a lone heading above all the rest, first in the text, is the book's title and no chapter
	const book = first >= 0 && heads[0] === first && units[first].heading === shallow && heads.filter((i) => units[i].heading === shallow).length === 1 && heads.length >= 3 ? first : null;
	const byLevel = new Map<number, number[]>();
	for (const i of heads) if (i !== book) byLevel.set(units[i].heading ?? 6, [...(byLevel.get(units[i].heading ?? 6) ?? []), i]);
	const roles = new Map<number, Role>();
	const levels = [...byLevel.keys()].sort((a, b) => a - b).filter((l) => (byLevel.get(l) ?? []).length >= 2);
	if (levels.length) {
		const [l1, l2, l3] = levels;
		const partLike = l2 !== undefined && (byLevel.get(l1) ?? []).every((i) => PARTLIKE.test(units[i].text.trim()));
		const chapterLevel = partLike ? l2 : l1, sceneLevel = partLike ? l3 : l2;
		roles.set(l1, partLike ? 'part' : 'chapter');
		if (partLike) roles.set(l2, 'chapter');
		if (sceneLevel !== undefined) {
			// a level under the chapters is scenes if half the chapters have it, else subheadings kept in the text
			const chapters = byLevel.get(chapterLevel) ?? [];
			let withScenes = 0, has = false;
			for (const i of [...heads].filter((h) => h !== book && [chapterLevel, sceneLevel].includes(units[h].heading ?? 6))) {
				if (units[i].heading === chapterLevel) { if (has) withScenes++; has = false; } else has = true;
			}
			if (has) withScenes++;
			roles.set(sceneLevel, chapters.length && withScenes * 2 >= chapters.length ? 'scene' : 'text');
		}
	}
	for (const l of byLevel.keys()) if (!roles.has(l)) roles.set(l, 'text');
	for (const [l, r] of choices.roles) if (byLevel.has(l)) roles.set(l, r);
	const headCuts: Cut[] = heads.flatMap((i): Cut[] => {
		const role = i === book ? 'text' : roles.get(units[i].heading ?? 6) ?? 'text';
		return role === 'text' ? [] : [{ at: i, level: role, title: units[i].text.trim(), by: 'heading', drop: true }];
	});

	// ---- R2: lines that read as titles ----
	let titleCuts: Cut[] = units.flatMap((u, i): Cut[] => {
		if (toc.has(i)) return [];
		const k = reads(u);
		if (!k || (k === 'bare' && !(u.centered || u.pageBefore))) return [];
		return [{ at: i, level: k === 'part' ? 'part' : 'chapter', title: u.raw?.trim() || plain(u.text), by: 'title', drop: true }];
	});
	// parts are only parts beside chapters
	if (!titleCuts.some((c) => c.level === 'chapter')) titleCuts = titleCuts.map((c) => ({ ...c, level: 'chapter' }));

	// ---- R3: a short line set apart after a page break ----
	const pageCuts: Cut[] = units.flatMap((u, i): Cut[] => (!toc.has(i) && u.pageBefore && u.heading === null && !u.empty && !isMarker(u) && u.words <= 8 && (u.centered || u.emphatic || isCaps(u.text.trim())) ? [{ at: i, level: 'chapter', title: u.raw?.trim() || plain(u.text), by: 'page', drop: true }] : []));

	const count = (cuts: Cut[]) => cuts.filter((c) => c.level !== 'scene').length;
	const counts: Record<Signal, number> = { headings: count(headCuts), titles: titleCuts.length, pages: pageCuts.length, none: 0 };
	const auto: Signal = counts.headings >= 2 ? 'headings' : counts.titles >= 2 ? 'titles' : counts.pages >= 2 ? 'pages' : 'none';
	let signal: Signal = choices.signal ?? auto;
	if (!counts[signal]) signal = 'none';
	const chosen = signal === 'headings' ? headCuts : signal === 'titles' ? titleCuts : signal === 'pages' ? pageCuts : [];
	const firstChapter = chosen.find((c) => c.level !== 'scene')?.at ?? -1;

	// ---- R4: scene breaks, among the chapters ----
	const marks = units.flatMap((u, i) => (!toc.has(i) && isMarker(u) ? [i] : []));
	const gaps = Math.max(0, units.length - 1), wide = units.flatMap((u, i) => (i > 0 && u.gap >= 2 && u.heading === null && !u.empty && !isMarker(u) ? [i] : []));
	const breakStyle: Found['breakStyle'] = marks.length ? 'marker' : wide.length && wide.length / gaps < 0.1 ? 'blank' : 'none';
	const into = (i: number) => firstChapter < 0 || i > firstChapter;
	const breakAt = breakStyle === 'marker' ? marks : breakStyle === 'blank' ? wide : [];
	// (a "keep" choice leaves the marks in the text, and blank-line breaks as the blank lines they are)
	const breakCuts: Cut[] = choices.breaks === 'new' ? breakAt.filter(into).map((i) => ({ at: i, level: 'scene', title: '', by: 'break', drop: breakStyle === 'marker' })) : [];
	const all = [...chosen.filter((c) => c.level !== 'scene' || into(c.at)), ...breakCuts];
	const cuts: Cut[] = [];
	for (const c of all.sort((a, b) => a.at - b.at || RANK[a.level] - RANK[b.level])) if (cuts[cuts.length - 1]?.at !== c.at) cuts.push(c);

	// ---- R5: sanity ----
	const wordsIn = (from: number, to: number) => units.slice(from + 1, to).reduce((sum, u) => sum + u.words, 0);
	const stops = cuts.filter((c) => c.level !== 'scene');
	const lengths = stops.flatMap((c, k) => (c.level === 'chapter' ? [wordsIn(c.at, stops[k + 1]?.at ?? units.length)] : []));
	const median = [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)] ?? 0;
	const doubtful = signal !== 'none' && lengths.length >= 2 && (lengths.filter((w) => w < 50).length / lengths.length > 0.3 || median < 200);

	const found: Found = {
		signal, counts, breaks: breakStyle === 'none' ? 0 : breakAt.filter(into).length, breakStyle, book,
		levels: [...byLevel.keys()].sort((a, b) => a - b).map((level) => ({ level, count: (byLevel.get(level) ?? []).length, role: roles.get(level) ?? 'text' })),
		front: firstChapter < 0 ? 0 : firstChapter, doubtful,
	};
	return { found, cuts };
}
