import { isMarker } from './import/detect';
import { moveDefinitions } from './import/definitions';
import { firstWords, nameOf } from './import/manuscript';
import { scanMarkdown } from './import/text';
import { lf, parts } from './scene-text';

/* "Split at headings...": one note cut into several, by its headings, its scene breaks, or a line of the writer's own. The
   same units and slicing as the manuscript import (import/text.ts): the pieces are slices of the note's text where the
   cuts are, so they joined are the text, byte for byte. Two things are not slices: when the writer takes the headings (or
   the marks) out of the text, those lines are what is left out; and a footnote or link written out at the foot goes to the
   pieces that mark it (import/definitions.ts). The first piece is the note itself and keeps its properties whole. Pure. */

export type SplitBy = { kind: 'heading'; level: number } | { kind: 'breaks' } | { kind: 'line'; text: string };

export interface Choices {
	/** The heading levels the text has below its start, and how many of each; and the scene breaks (a mark between blank lines). */
	headings: { level: number; count: number }[];
	breaks: number;
}
export interface Piece {
	/** Its text, without properties. */
	text: string;
	/** What it is called: its heading's, else its first words. The first piece is the note and has none of its own. */
	title: string;
}

/** The units of a note's text that a split by this cuts at (their numbers), among all its units. */
function cutUnits(body: string, by: SplitBy): { units: ReturnType<typeof scanMarkdown>['units']; at: number[] } {
	const { units } = scanMarkdown(body);
	const wanted = (u: (typeof units)[number]): boolean => {
		if (by.kind === 'heading') return u.heading === by.level;
		if (u.heading !== null) return false;
		if (by.kind === 'breaks') return isMarker(u);
		return by.text.trim() !== '' && body.slice(u.start, u.end).trim() === by.text.trim();
	};
	return { units, at: units.flatMap((u, i) => (wanted(u) ? [i] : [])) };
}

/** What a note can be cut by, and how many pieces each would make. */
export function choicesFor(text: string): Choices {
	const { body } = parts(lf(text)), levels = new Map<number, number>();
	for (let level = 1; level <= 6; level++) {
		const n = planSplit(text, { kind: 'heading', level }, false).length - 1;
		if (n > 0) levels.set(level, n);
	}
	return { headings: [...levels].map(([level, count]) => ({ level, count })), breaks: planSplit(`${body}`, { kind: 'breaks' }, false).length - 1 };
}

/** The pieces a note makes. `take`: the heading (or mark) lines that start the new pieces are taken out of the text, a
    heading becoming the new note's name. Nothing is cut where there is nothing before it, or nothing after it. */
export function planSplit(text: string, by: SplitBy, take: boolean): Piece[] {
	const { body } = parts(lf(text)), { units, at } = cutUnits(body, by), cutSet = new Set(at);
	const bounds: { end: number; start: number; title: string }[] = [];
	let seen = false;
	units.forEach((u, i) => {
		if (cutSet.has(i) && seen) {
			// a cut with no text after it, before the next, makes no note
			const next = at.find((c) => c > i) ?? units.length;
			const more = units.slice(i + 1, next).some((x) => !isMarker(x) || x.heading !== null);
			if (more || (by.kind === 'heading' && !take)) {
				const after = units[i + 1]?.start ?? body.length;
				if (by.kind === 'heading') bounds.push({ end: u.start, start: take ? u.end : u.start, title: nameOf(u.text) });
				else bounds.push({ end: take ? u.start : after, start: take ? u.end : after, title: '' });
			}
		}
		if (!cutSet.has(i) || by.kind === 'heading') seen = seen || !isMarker(u) || u.heading !== null;
		else if (!isMarker(u)) seen = true;
	});
	const slices: string[] = [];
	let from = 0;
	for (const b of bounds) { slices.push(body.slice(from, b.end)); from = b.start; }
	slices.push(body.slice(from));
	const texts = moveDefinitions(slices.map((s, k) => (k > 0 && take ? s.replace(/^\n+/, '') : s)));
	return texts.map((t, k) => ({ text: t, title: k === 0 ? '' : bounds[k - 1].title || firstWords(t) || 'Untitled' }));
}
