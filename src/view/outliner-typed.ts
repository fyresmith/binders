import { DATE_SHAPE, DATETIME_SHAPE, isListKind, type Kind } from '../inspector/property-fields';

/* What typing into a property's cell means, and what a cell shows, by the property's type (Obsidian's, as the
   inspector's pinned rows have it) and not by what the value was. Pure. */

/** A list is split at commas, a number must be one (not turned into text), a date must be written as one, a box is
    true or false, and nothing typed takes the property away (value undefined). `error` says why it can't be used. */
export function readTyped(typed: string, kind: Kind): { value: unknown } | { error: string } {
	const t = typed.trim();
	if (isListKind(kind)) {
		const items = t.split(',').map((x) => x.trim()).filter((x) => x);
		return { value: items.length ? items : undefined };
	}
	if (!t) return { value: undefined };
	if (kind === 'number') return /^-?\d+([.,]\d+)?$/.test(t) ? { value: Number(t.replace(',', '.')) } : { error: `“${t}” isn’t a number.` };
	if (kind === 'checkbox') {
		const l = t.toLowerCase();
		return ['true', 'yes', 'checked', 'on'].includes(l) ? { value: true } : ['false', 'no', 'unchecked', 'off'].includes(l) ? { value: false } : { error: 'A box is true or false.' };
	}
	if (kind === 'date') return DATE_SHAPE.test(t) ? { value: t } : { error: 'A date is written like 2026-03-04.' };
	if (kind === 'datetime') return DATETIME_SHAPE.test(t) ? { value: t } : { error: 'A date and time is written like 2026-03-04T10:30.' };
	return { value: t };
}

/** What a property's cell shows, as pieces: text, and for a link the note it points at (`href`, as written in the
    link) and the words it shows. */
export function cellParts(v: unknown): { text: string; href?: string }[] {
	const out: { text: string; href?: string }[] = [];
	for (const x of Array.isArray(v) ? v as unknown[] : [v]) {
		if (typeof x === 'number' || typeof x === 'boolean') { out.push({ text: String(x) }); continue; }
		if (typeof x !== 'string' || !x.trim()) continue;
		const m = /^\s*\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]\s*$/.exec(x);
		if (!m) { out.push({ text: x.trim() }); continue; }
		const href = m[1].trim();
		out.push({ text: (m[2] ?? '').trim() || (href.split('#')[0].split('/').pop() ?? href), href });
	}
	return out;
}
