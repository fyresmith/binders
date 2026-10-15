import type { Calendar } from '../time/date';
/* What a value names: the link identity rule, in one small pure place (the filter and the inspector both use it).
   A link names the note it points at, whatever it shows (`[[Harrow|the keeper]]` is `[[Harrow]]`); plain `Mara` is the same
   name as `[[Mara]]`, in any case and either Unicode form; links to two different notes that are both named Mara are two
   people. `Env.resolve` is the vault's answer to "which note does this link point at" (its path, or null). */

/** What the vault knows that the conditions can't: the note a link names (its path), or null if it names none. */
/** What matching needs from where it runs: how a link resolves, and the calendar the binder's story dates are in. */
export interface Env { resolve(link: string): string | null; cal?: Calendar }

/** Text as it is compared: trimmed, in one Unicode form, without case. */
export const fold = (s: string): string => s.normalize('NFC').trim().toLowerCase();
const LINK = /^\s*\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]\s*$/;
/** A link as a property holds it: what it points at (without a heading), and what it shows. Null for plain text. */
export function linkOf(s: string): { target: string; shown: string } | null {
	const m = LINK.exec(s);
	if (!m) return null;
	const target = m[1].split('#')[0].trim() || m[1].trim();
	return { target, shown: (m[2] ?? '').trim() || (target.split('/').pop() ?? target) };
}
/** One value as it is compared: the note it names if it is a link to one, the name it goes by, and what it shows. */
export interface Atom { file: string | null; name: string; shown: string; low: string }
export function atom(v: unknown, env: Env): Atom | null {
	if (typeof v === 'number' || typeof v === 'boolean') { const s = String(v); return { file: null, name: s, shown: s, low: s }; }
	if (typeof v !== 'string' || !v.trim()) return null;
	const link = linkOf(v);
	if (!link) { const n = fold(v); return { file: null, name: n, shown: v.trim(), low: n }; }
	const file = env.resolve(link.target);
	const base = (file ?? link.target).split('/').pop() ?? '';
	return { file, name: fold(base.replace(/\.md$/i, '')), shown: link.shown, low: fold(link.shown) };
}
/** Two values are the same thing: links to the same note whatever they show, or the same name. */
export const same = (a: Atom, b: Atom): boolean => (a.file && b.file ? a.file === b.file : a.name === b.name);

/** A property's value as a list of things: a list's items, or the one value; nothing for none. */
export function atoms(v: unknown, env: Env): Atom[] {
	const list: unknown[] = Array.isArray(v) ? v : [v];
	const out: Atom[] = [];
	for (const x of list) { const a = atom(x, env); if (a) out.push(a); }
	return out;
}
/** A value as text: text and numbers and checkboxes as written, nothing else. */
export const textOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
export const isEmpty = (v: unknown): boolean => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.every(isEmpty));

