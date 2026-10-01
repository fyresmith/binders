/* Labels and statuses. A label is plain text in a note's properties. What color it shows in comes from the labels in
   Binders' settings (a name and a color each, as Scrivener's labels have): one of Obsidian's accent colors, which every
   theme sets through its --color-* variables, or a color of your own. A label that isn't in the list still shows: in
   its own color if it names one of Obsidian's or is a color itself ("#c0392b", a custom color given to one card), and
   in a neutral color otherwise. Pure, so it can be unit-tested. */

/** Obsidian's palette: each has a `--color-<name>` variable in every theme. */
export const PALETTE = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type PaletteColor = typeof PALETTE[number];

/** A label in settings. `color` is one of PALETTE (the theme's own shade) or a hex color. */
export interface LabelPreset { name: string; color: string }

/** Sentence case for a label or status shown in a menu ("red" → "Red"), leaving the stored text as it is. */
export const display = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The labels a new vault starts with: Obsidian's colors, by name, so `label: blue` reads as it's written. */
export const DEFAULT_LABELS: LabelPreset[] = PALETTE.map((c) => ({ name: display(c), color: c }));
/** The statuses a new vault starts with, in the order a draft goes through them. */
export const DEFAULT_STATUSES: string[] = ['Idea', 'Draft', 'Revised', 'Done'];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isPalette = (c: string): c is PaletteColor => (PALETTE as readonly string[]).includes(c);

/** "#abc" or "#aabbcc" (any case), as a lower-case six-digit color; null for anything else. */
export function hexColor(s: string): string | null {
	// (#rgb, #rrggbb, and either with an alpha, which a label has no use for)
	const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
	if (!m) return null;
	const h = m[1].toLowerCase(), short = h.length < 6;
	return '#' + (short ? [...h.slice(0, 3)].map((c) => c + c).join('') : h.slice(0, 6));
}

/** A color from settings or a label as CSS: the theme's variable for one of Obsidian's colors, or the hex color. */
export function colorCss(color: string): string | null {
	const c = color.trim().toLowerCase();
	return isPalette(c) ? `var(--color-${c})` : hexColor(c);
}

/** The label in settings with this name (any case), if there is one. */
export function presetOf(label: string, presets: readonly LabelPreset[]): LabelPreset | null {
	return label.trim() ? presets.find((p) => same(p.name, label)) ?? null : null;
}

/** What a label is, for a class name: one of Obsidian's colors, `custom` (a hex color), `other` (a label with no color
    of its own), or null for no label. */
export function labelKind(label: string, presets: readonly LabelPreset[]): PaletteColor | 'custom' | 'other' | null {
	if (!label.trim()) return null;
	const c = (presetOf(label, presets)?.color ?? label).trim().toLowerCase();
	return isPalette(c) ? c : hexColor(c) ? 'custom' : 'other';
}

/** The color a label shows in, as CSS, or null for no label. */
export function labelCss(label: string, presets: readonly LabelPreset[]): string | null {
	if (!label.trim()) return null;
	return colorCss(presetOf(label, presets)?.color ?? label) ?? 'var(--text-faint)';
}

/** A label as menus and cells name it: as settings spell it, "Custom color" for a color of its own, else as written. */
export function labelName(label: string, presets: readonly LabelPreset[]): string {
	const l = label.trim();
	return presetOf(l, presets)?.name ?? (hexColor(l) ? 'Custom color' : display(l));
}

/** Gives an element its label's color: `--binders-label` for the stylesheet, and a class to say what kind it is. */
export function paintLabel(el: HTMLElement, label: string, presets: readonly LabelPreset[]): void {
	const kind = labelKind(label, presets), css = labelCss(label, presets);
	for (const c of [...el.classList]) if (c.startsWith('mod-label-')) el.removeClass(c);
	el.toggleClass('has-label', !!kind);
	if (kind) el.addClass(`mod-label-${kind}`);
	el.setCssProps({ '--binders-label': css ?? '' });
	if (kind) el.dataset.label = label; else delete el.dataset.label;
}

/** A small colored dot for a label, as shown in menus, headings and the outliner. */
export function labelDot(parent: DocumentFragment | HTMLElement, label: string, presets: readonly LabelPreset[]): HTMLElement {
	const dot = parent.createSpan({ cls: `binders-label-dot mod-${labelKind(label, presets) ?? 'none'}` });
	const css = labelCss(label, presets);
	if (css) dot.setCssProps({ '--binders-label': css });
	return dot;
}

/** Labels read from saved settings: only well-formed ones, names trimmed and unique, colors as CSS can show them. */
export function readLabels(v: unknown): LabelPreset[] | null {
	if (!Array.isArray(v)) return null;
	const out: LabelPreset[] = [];
	for (const x of v as unknown[]) {
		if (!x || typeof x !== 'object') continue;
		const { name, color } = x as { name?: unknown; color?: unknown };
		if (typeof name !== 'string' || !name.trim() || typeof color !== 'string' || out.some((p) => same(p.name, name))) continue;
		const c = color.trim().toLowerCase();
		out.push({ name: name.trim(), color: isPalette(c) ? c : hexColor(c) ?? 'red' });
	}
	return out;
}

/** Statuses read from saved settings: text, trimmed, no blanks or repeats. */
export function readStatuses(v: unknown): string[] | null {
	if (!Array.isArray(v)) return null;
	const out: string[] = [];
	for (const x of v as unknown[]) if (typeof x === 'string' && x.trim() && !out.some((s) => same(s, x))) out.push(x.trim());
	return out;
}

/** A status or label as settings spell it, if it's one of theirs in another case ("draft" is "Draft"), else as written:
    so a filter, a sort and the chips treat the two as the one thing they are. */
export function canonical(value: string, names: readonly string[]): string {
	const v = value.trim();
	return (v && names.find((n) => same(n, v))) || v;
}

/** A note's label from its property, as every view reads it: text (a list's first entry, a number as written), a color
    written any way (#ABC, #aabbcc) as one spelling, a preset's name as settings spell it. "" for none. */
export function readLabel(v: unknown, names: readonly string[]): string {
	const first: unknown = Array.isArray(v) ? v.find((x) => typeof x === 'string' || typeof x === 'number') : v;
	const t = typeof first === 'string' ? first.trim() : typeof first === 'number' ? String(first) : '';
	return hexColor(t) ?? canonical(t, names);
}

/** A name for a new label or status that isn't taken: "New label", "New label 2"… */
export function freeName(base: string, taken: readonly string[]): string {
	let name = base;
	for (let n = 2; taken.some((t) => same(t, name)); n++) name = `${base} ${n}`;
	return name;
}

/** Where a value comes in a list of presets (any case), for sorting; after them all if it isn't one. */
export function rank(value: string, order: readonly string[]): number {
	const i = order.findIndex((o) => same(o, value));
	return i < 0 ? order.length : i;
}
