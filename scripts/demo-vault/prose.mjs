// The example books' prose: paragraphs composed, from a seed, out of sentences and half-sentences written for the
// purpose (stock/). It reads like a draft when skimmed (dialogue with its attributions, description, long and short
// paragraphs, a thought in italics, a scene break) and means nothing. Pure.
//
// A world is a book's own stock: who is in it, where, what lies about, and the sentences only it has.
//   { person: 3 | 1, quotes: 'straight' | 'curly', cast: ['Ines:she', …], places: ['on the quay', …],
//     things: ['the ledger', …], own: { sent, leads, tails, pairs, thoughts }, mix: { … } }
// The slots a piece of stock may have:
//   {Name} {name}       the scene's point of view: the name the first time in a paragraph, then the pronoun ("I" in
//                       the first person)
//   {She} {she} {her} {him} {herself}   that person's pronouns (her book, saw him)
//   {O} {Oshe} {oshe} {oher} {ohim}     someone else in the scene, and theirs
//   {place} {atplace} {thing}           "the quay", "on the quay", "the ledger"
import { int, pick } from './core.mjs';

const PRONOUNS = {
	she: { she: 'she', her: 'her', him: 'her', herself: 'herself' },
	he: { she: 'he', her: 'his', him: 'him', herself: 'himself' },
	they: { she: 'they', her: 'their', him: 'them', herself: 'themself' },
	i: { she: 'I', her: 'my', him: 'me', herself: 'myself' },
};
const cap = (s) => s.replace(/^([*"“‘'(]*)(\p{Ll})/u, (_m, a, b) => a + b.toUpperCase());
export const wordsIn = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const person = (entry) => { const [name, g = 'she'] = entry.split(':'); return { name, ...PRONOUNS[g] }; };

/** A list dealt like a pack of cards: nothing comes round again until everything has been out once. */
function deck(rand, list) {
	let left = [];
	return () => {
		if (!left.length) { left = [...list]; for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; } }
		return left.pop();
	};
}

/** A sentence that can follow ", and": it begins with a word that is not a name. */
const JOINS = /^(The|A|An|It|There|Nobody|Somebody|Someone|Somewhere|Smoke|Fog|Dust|Mud|Rooks|Gulls|Two|All|Every|In|By|Out|Outside|At|From|On) /;

/** A lead that is one plain action: another can be joined to it with "and". */
const SIMPLE = /^\{Name\} (?!had |could |was |did |knew |thought |remembered |woke |said )[a-z]+ (?!.* and )[^,]*$/;

/** What a paragraph is, how often. A world's `mix` changes any of them. */
const MIX = { talk: 0.3, short: 0.045, thought: 0.05, long: 0.1, own: 2, tail: 0.5, lead: 0.72, breakEvery: 900 };

/** A writer for one book: `scene(opts)` gives a scene's paragraphs. Keep one for the whole book, so that a sentence
    used in one scene isn't used again until the rest of the stock has been. */
export function writer(stock, world, rand) {
	const mix = { ...MIX, ...world.mix }, own = world.own ?? {};
	const cast = world.cast.map(person);
	const d = {};
	for (const k of ['leads', 'tails', 'sent', 'pairs', 'beats', 'thoughts', 'shorts', 'turns']) {
		const mine = own[k] ?? [], shared = stock[k] ?? [];
		d[k] = { own: mine.length ? deck(rand, mine) : null, shared: shared.length ? deck(rand, shared) : null };
	}
	const draw = (k, solo) => {
		for (let i = 0; i < 12; i++) {
			// (a book's own line comes up `mix.own` times as often as a shared one, however many of each there are)
			const mine = (own[k]?.length ?? 0) * mix.own, all = mine + (stock[k]?.length ?? 0);
			const from = d[k].own && (!d[k].shared || rand() * all < mine) ? d[k].own : d[k].shared;
			if (!from) return k === 'pairs' ? ['Well.', 'Well.'] : '';
			const s = from();
			const text = Array.isArray(s) ? s.join(' ') : s;
			if (!solo || !/\{[Oo]/.test(text)) return s;
		}
		return k === 'pairs' ? ['Well.', 'Well.'] : '';
	};
	const places = deck(rand, world.places), things = deck(rand, world.things);
	const q = world.quotes === 'curly' ? ['“', '”'] : ['"', '"'];
	const typed = (s) => (world.quotes === 'curly' ? s.replace(/'/g, '’') : s);

	function scene({ pov, others = [], words = 900, opening, place, breaks = true } = {}) {
		const me = world.person === 1 ? { name: 'I', ...PRONOUNS.i } : cast.find((c) => c.name === pov) ?? cast[0];
		const rest = others.length ? cast.filter((c) => others.includes(c.name) && c.name !== me.name && c.name !== world.narrator) : [];
		const solo = !rest.length;
		// a scene stays in a place or two, among a few things
		const here = [place ?? places(), places()], about = [things(), things(), things()];
		let other = rest[0], named = false, met = false, count = 0;
		const fill = (s, mid = false) => typed(s
			.replace(/\{Name\}|\{name\}/g, (m) => { const first = !named && world.person !== 1; named = true; return first ? me.name : m === '{Name}' && !mid ? cap(me.she) : me.she; })
			.replace(/\{She\}/g, cap(me.she)).replace(/\{she\}/g, me.she).replace(/\{her\}/g, me.her).replace(/\{him\}/g, me.him).replace(/\{herself\}/g, me.herself)
			// (someone else: the name once in a paragraph, then "he" or "him" by where it stands, unless that would be
			// the point of view's own pronoun)
			.replace(/\{O\}('s)?/g, (m, s, at, all) => {
				if (!other) return s ? 'someone’s' : 'someone';
				const again = met && other.she !== me.she;
				met = true;
				if (!again) return other.name + (s ?? '');
				if (s) return other.her;
				return /(^|, and |[.?!] )$/.test(all.slice(0, at)) ? (at ? other.she : cap(other.she)) : other.him;
			})
			.replace(/\{Oshe\}/g, cap(other?.she ?? 'they')).replace(/\{oshe\}/g, other?.she ?? 'they').replace(/\{oher\}/g, other?.her ?? 'their').replace(/\{ohim\}/g, other?.him ?? 'them')
			.replace(/\{atplace\}/g, () => (rand() < 0.75 ? here[0] : here[1])).replace(/\{place\}/g, () => (rand() < 0.75 ? here[0] : here[1]).replace(/^\S+ /, ''))
			.replace(/\{thing\}/g, () => pick(rand, about)));
		// nothing twice in one scene, and no run of bare "She did this. She did that."
		const used = new Set();
		const fresh = (k) => { let s = draw(k, solo); for (let i = 0; i < 6 && used.has(s); i++) s = draw(k, solo); used.add(s); return s; };
		let bare = false;
		const sentence = (first) => {
			if (rand() > mix.lead || (first === true && rand() < 0.3)) {
				// (two short ones may be joined: a pair of them is a sentence the book has nowhere else)
				const a = fresh('sent'), b = a.length < 60 && rand() < 0.5 ? fresh('sent') : '';
				bare = false;
				return cap(fill(b && b.length < 60 && JOINS.test(b) ? `${a.slice(0, -1)}, and ${b[0].toLowerCase()}${b.slice(1)}` : a));
			}
			const turn = first !== true && rand() < 0.16 ? draw('turns', solo) : '';
			let lead = fresh('leads');
			// (two things done one after the other)
			let both = false;
			if (!turn && SIMPLE.test(lead) && rand() < 0.2) { const b = fresh('leads'); if (SIMPLE.test(b)) { lead += ` and ${b.replace(/^\{Name\} /, '')}`; both = true; } }
			// (after a lead about someone else, a tail that says "her" would mean the wrong person)
			// (and one that names them again would name them twice)
			const theirs = lead.startsWith('{O}'), bad = theirs ? /\{(she|her|him|herself|O)\}/ : /\{O\}/.test(lead) ? /\{O\}/ : null;
			let tail = rand() < (theirs ? 0.3 : both ? 0.15 : bare ? 0.9 : mix.tail) ? draw('tails', solo) : '.';
			for (let i = 0; bad && i < 6 && bad.test(tail); i++) tail = draw('tails', solo);
			if (bad?.test(tail)) tail = '.';
			bare = tail === '.' && !both && !turn;
			// (after "In the end", a lead goes on in lower case, unless it begins with a name)
			return cap(fill(turn ? `${turn} ${lead.replace(/^\{Name\}/, '{name}').replace(/^[A-Z](?=[a-z]* )/, (c) => c.toLowerCase())}${tail}` : lead + tail, !!turn));
		};
		const para = (n) => { named = false; met = false; return Array.from({ length: n }, (_, i) => sentence(i === 0)).join(' '); };
		const line = (text, who, i) => {
			named = true;
			const said = fill(text), ends = /[?!]$/.test(said), verb = /\?$/.test(said) ? 'asked' : 'said';
			const body = ends ? said : said.replace(/\.$/, ',');
			const r = rand();
			if (i > 1 && r < 0.45) return `${q[0]}${said}${q[1]}`;
			if (r < 0.7) return `${q[0]}${body}${q[1]} ${who === me && world.person === 1 ? 'I' : who.name} ${verb}.`;
			const beat = who === me ? `${cap(fill('{Name}'))} ${fill(draw('beats', true))}` : `${who.name} ${fill(draw('beats', true))}`;
			return `${beat} ${q[0]}${said}${q[1]}`;
		};
		const talk = () => {
			other = pick(rand, rest);
			const out = [];
			for (let n = int(rand, 1, 3), i = 0; n > 0; n--) {
				const [a, b] = draw('pairs', false), meFirst = rand() < 0.4;
				out.push(line(a, meFirst ? me : other, i++), line(b, meFirst ? other : me, i++));
				if (rand() < 0.3) { named = true; out.push(para(int(rand, 1, 2))); }
			}
			return out;
		};
		const out = [];
		const put = (...p) => { for (const x of p) { out.push(x); count += wordsIn(x); } };
		named = false;
		put(opening ? `${typed(opening)} ${para(int(rand, 1, 3))}` : para(int(rand, 3, 5)));
		let sinceBreak = count, small = true;
		while (count < words) {
			const before = count, r = rand(), wasSmall = small;
			if (rest.length) other = pick(rand, rest);
			small = false;
			if (!solo && r < mix.talk) put(...talk());
			// (a paragraph of a few words, or a thought, only after a full one)
			else if (!wasSmall && r < mix.talk + mix.short) { named = true; put(cap(fill(fresh('shorts')))); small = true; }
			else if (!wasSmall && r < mix.talk + mix.short + mix.thought) { put(`*${cap(fill(fresh('thoughts')))}*`); small = true; }
			else put(para(rand() < mix.long ? int(rand, 7, 10) : int(rand, 2, 6)));
			sinceBreak += count - before;
			if (breaks && sinceBreak > mix.breakEvery && words - count > 250 && rand() < 0.5) { out.push(BREAK); sinceBreak = 0; here.reverse(); }
		}
		return out;
	}
	return { scene, cast: cast.map((c) => c.name) };
}

/** A scene break among a scene's paragraphs. */
export const BREAK = '<<scene break>>';

/** Paragraphs as a note's text. `tabs`: every paragraph begins with a tab and they follow one another line by line,
    as text typed by a novelist or brought in from Scrivener does. `mark`: what a scene break is typed as. */
export function text(paras, { tabs = false, mark = '***' } = {}) {
	if (!tabs) return paras.map((p) => (p === BREAK ? mark : p)).join('\n\n') + '\n';
	let out = '';
	for (const p of paras) out += p === BREAK ? `\n${mark}\n\n` : `\t${p}\n`;
	return out;
}

/** The names of a world's people that a line (a synopsis, say) mentions: who is in the scene. */
export const mentioned = (world, line) => world.cast.map((c) => c.split(':')[0]).filter((n) => new RegExp(`\\b${n}\\b`).test(line));
