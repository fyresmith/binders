// The English stock every example book shares; each book adds its own (its world).
import { LEADS, LEADS_WITH } from './en-leads.mjs';
import { LEADS_2, LEADS_WITH_2 } from './en-leads-2.mjs';
import { TAILS, TAILS_WITH } from './en-tails.mjs';
import { TAILS_2 } from './en-tails-2.mjs';
import { SENT } from './en-sent.mjs';
import { SENT_2 } from './en-sent-2.mjs';
import { BEATS, PAIRS, SHORTS, THOUGHTS, TURNS } from './en-talk.mjs';
import { PAIRS_2, SHORTS_2, THOUGHTS_2 } from './en-talk-2.mjs';

export const EN = {
	leads: [...LEADS, ...LEADS_2, ...LEADS_WITH, ...LEADS_WITH_2], tails: [...TAILS, ...TAILS_2, ...TAILS_WITH],
	sent: [...SENT, ...SENT_2], pairs: [...PAIRS, ...PAIRS_2], beats: BEATS,
	thoughts: [...THOUGHTS, ...THOUGHTS_2], shorts: [...SHORTS, ...SHORTS_2], turns: TURNS,
};
