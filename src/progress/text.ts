/* Progress over time: what the book's text says of itself as it stands today. Needs no history. Pure.
   (No lookbehind in a pattern: iOS before 16.4 can't read one.) */

import { count, fmt } from './model';
import type { Fact } from './stats';

export interface SceneText { name: string; text: string; words: number }

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SENTENCE = /[^.!?…]+[.!?…]+["”’»)]*|[^.!?…]+$/g;
const SPOKEN = /“[^”]*”|"[^"\n]*"|«[^»]*»/g;
const NAME = /^\p{Lu}\p{Ll}{2,}$/u;
const words = (s: string): string[] => s.match(WORD) ?? [];
const last = (path: string): string => path.split('/').pop() ?? path;

export function textFacts(scenes: SceneText[]): Fact[] {
	const out: Fact[] = [];
	const add = (label: string, value: string, note = ''): void => { out.push({ group: 'The text', label, value, note, needs: 'text' }); };
	const written = scenes.filter((s) => s.words > 0);
	const total = written.reduce((a, s) => a + s.words, 0);
	if (!total) return out;
	let sentences = 0, sentenceWords = 0, longest = 0, longestIn = '', spoken = 0;
	const names = new Map<string, number>();
	for (const s of written) {
		for (const para of s.text.split(/\n+/)) {
			for (const q of para.match(SPOKEN) ?? []) spoken += words(q).length;
			for (const sent of para.match(SENTENCE) ?? []) {
				const w = words(sent);
				if (!w.length) continue;
				sentences++; sentenceWords += w.length;
				if (w.length > longest) { longest = w.length; longestIn = last(s.name); }
				// a name is a capital inside a sentence, not at its start
				for (let i = 1; i < w.length; i++) if (NAME.test(w[i])) names.set(w[i], (names.get(w[i]) ?? 0) + 1);
			}
		}
	}
	const minutes = total / 250;
	add('To read it through', minutes >= 60 ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min` : `${Math.max(1, Math.round(minutes))} min`, `${fmt(Math.ceil(total / 300))} pages of a paperback, about`);
	if (written.length >= 2) {
		const by = [...written].sort((a, b) => b.words - a.words);
		add('Longest scene', last(by[0].name), `${fmt(by[0].words)} words`);
		add('Shortest scene', last(by[by.length - 1].name), `${fmt(by[by.length - 1].words)} words`);
		add('A usual scene', fmt(by[Math.floor(by.length / 2)].words), `the middle one of ${count(by.length, 'scene')}`);
	}
	if (sentences >= 5) {
		add('A sentence', `${(sentenceWords / sentences).toFixed(1)} words`, `${fmt(sentences)} of them`);
		add('Longest sentence', `${fmt(longest)} words`, `in ${longestIn}`);
	}
	if (spoken > 0 && total > 500) add('Spoken aloud', `${Math.round((spoken / total) * 100)}%`, 'of the words are inside quotation marks');
	const top = [...names].filter((n) => n[1] >= 5).sort((a, b) => b[1] - a[1]).slice(0, 3);
	if (top.length) add('Named most', top[0][0], top.map((n) => `${n[0]} ${fmt(n[1])}`).join(', '));
	return out;
}
