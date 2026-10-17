/* Progress over time: what the book's text says of itself as it stands today. Needs no history. Pure.
   (No names: telling a character from a Sunday needs a list of words for every language, so nothing is guessed.)
   (No lookbehind in a pattern: iOS before 16.4 can't read one.) */

import { count, fmt } from './model';
import type { Fact } from './stats';

/** `shown`: the note's name as it is shown (its title, else its file name); `name` is its path in the binder, no ".md". */
export interface SceneText { name: string; text: string; words: number; shown?: string }

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SENTENCE = /[^.!?…]+[.!?…]+["”’»)]*|[^.!?…]+$/g;
const SPOKEN = /“[^”]*”|"[^"\n]*"|«[^»]*»/g;
const words = (s: string): string[] => s.match(WORD) ?? [];
const last = (path: string): string => path.split('/').pop() ?? path;

export function textFacts(scenes: SceneText[]): Fact[] {
	const out: Fact[] = [];
	const add = (label: string, value: string, note = ''): void => { out.push({ group: 'The text', label, value, note }); };
	const written = scenes.filter((s) => s.words > 0);
	const total = written.reduce((a, s) => a + s.words, 0);
	if (!total) return out;
	let sentences = 0, sentenceWords = 0, longest = 0, longestIn = '', spoken = 0;
	for (const s of written) {
		for (const para of s.text.split(/\n+/)) {
			for (const q of para.match(SPOKEN) ?? []) spoken += words(q).length;
			for (const sent of para.match(SENTENCE) ?? []) {
				const w = words(sent);
				if (!w.length) continue;
				sentences++; sentenceWords += w.length;
				if (w.length > longest) { longest = w.length; longestIn = s.shown ?? last(s.name); }
			}
		}
	}
	const minutes = total / 250;
	add('To read it through', minutes >= 60 ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min` : `${Math.max(1, Math.round(minutes))} min`, `${fmt(Math.ceil(total / 300))} pages of a paperback, about`);
	if (written.length >= 2) {
		const by = [...written].sort((a, b) => b.words - a.words);
		add('Longest scene', by[0].shown ?? last(by[0].name), `${fmt(by[0].words)} words`);
		add('Shortest scene', by[by.length - 1].shown ?? last(by[by.length - 1].name), `${fmt(by[by.length - 1].words)} words`);
		add('A usual scene', fmt(by[Math.floor(by.length / 2)].words), `the middle one of ${count(by.length, 'scene')}`);
	}
	if (sentences >= 3) {
		add('A sentence', `${(sentenceWords / sentences).toFixed(1)} words`, `${fmt(sentences)} of them`);
		add('Longest sentence', `${fmt(longest)} words`, `in ${longestIn}`);
	}
	if (spoken > 0 && total > 500) add('Spoken aloud', `${Math.round((spoken / total) * 100)}%`, 'of the words are inside quotation marks');
	return out;
}
