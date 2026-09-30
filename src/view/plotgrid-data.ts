/* The plot grid's data: plotlines and their colors in the binder note, a scene's plotlines, and the list edits the grid
   makes. Pure, so it can be unit-tested. */

/** The binder note's properties for the grid (format 1): the columns in order, and optional colors by plotline. */
export const PLOTLINES = 'plotlines';
export const PLOTLINE_COLORS = 'plotlineColors';
/** Reserved: a scene's text per plotline (`plot: {Mara: "…"}`), for a later version. Not edited yet; the grid only
    renames or removes a plotline's key in it along with the plotline. */
export const PLOT_TEXT = 'plot';

/** Obsidian's palette: each has a `--color-<name>` (and `-rgb`) variable in every theme. */
export const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type PlotColor = typeof COLORS[number];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A list property as names: trimmed, no blanks or repeats. A single text value counts as a list of one. */
export function readList(v: unknown): string[] {
	const raw = Array.isArray(v) ? v : v == null ? [] : [v];
	const out: string[] = [];
	for (const x of raw) {
		if (typeof x !== 'string' && typeof x !== 'number') continue;
		const s = String(x).trim();
		if (s && !out.includes(s)) out.push(s);
	}
	return out;
}

/** The colors the binder note gives its plotlines; unknown colors are ignored. */
export function readColors(v: unknown): Record<string, PlotColor> {
	const out: Record<string, PlotColor> = {};
	if (!isObj(v)) return out;
	for (const [k, c] of Object.entries(v)) if (typeof c === 'string' && (COLORS as readonly string[]).includes(c.trim().toLowerCase())) out[k.trim()] = c.trim().toLowerCase() as PlotColor;
	return out;
}

/** The plotlines a scene has text for in its reserved `plot` property. */
export function readPlotText(v: unknown): Set<string> {
	const out = new Set<string>();
	if (isObj(v)) for (const [k, t] of Object.entries(v)) if ((typeof t === 'string' && t.trim()) || typeof t === 'number') out.add(k.trim());
	return out;
}

/** Adds the name if it's missing, removes it if it's there. */
export function toggle(list: string[], name: string): string[] {
	return list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
}

/** Renames an entry in place; if the new name is already there, the two become one. */
export function rename(list: string[], from: string, to: string): string[] {
	const out: string[] = [];
	for (const x of list.map((x) => (x === from ? to : x))) if (!out.includes(x)) out.push(x);
	return out;
}

/** Moves the entry at `from` so it ends up at index `to`. */
export function move<T>(list: T[], from: number, to: number): T[] {
	if (from < 0 || from >= list.length) return list;
	const out = [...list];
	const [x] = out.splice(from, 1);
	out.splice(Math.max(0, Math.min(to, out.length)), 0, x);
	return out;
}

/** The colors after a rename or delete; undefined when none are left (so the property is removed). */
export function recolor(colors: Record<string, PlotColor>, from: string, to: string | null): Record<string, PlotColor> | undefined {
	const out: Record<string, PlotColor> = {};
	for (const [k, c] of Object.entries(colors)) {
		if (k === from) { if (to) out[to] = c; } else if (k !== to) out[k] = c; // a stale color under the new name gives way
	}
	return Object.keys(out).length ? out : undefined;
}

/** Why a new name for a plotline can't be used, or null. `current` is the plotline being renamed, if any. */
export function nameProblem(name: string, plotlines: string[], current?: string): string | null {
	if (!name) return 'A plotline needs a name.';
	if (name !== current && plotlines.includes(name)) return `There’s already a plotline called “${name}”.`;
	return null;
}

/** The key in a `plot` map that stands for a plotline (keys are read trimmed), or null. */
function plotKey(plot: Record<string, unknown>, name: string): string | null {
	return Object.keys(plot).find((k) => k.trim() === name) ?? null;
}

/** Whether a note's properties have a `plot` entry for this plotline (with text or not). */
export function hasPlotKey(fm: Record<string, unknown>, name: string): boolean {
	const plot = fm[PLOT_TEXT];
	return isObj(plot) && plotKey(plot, name) != null;
}

/** Renames a plotline's key in a note's `plot` map in place, keeping its place and everything else as it is. "conflict":
    the new name has an entry already, so nothing changes rather than one text replacing another. */
export function renamePlotKey(fm: Record<string, unknown>, from: string, to: string): 'renamed' | 'none' | 'conflict' {
	const plot = fm[PLOT_TEXT];
	if (!isObj(plot)) return 'none';
	const key = plotKey(plot, from);
	if (key == null) return 'none';
	if (plotKey(plot, to) != null) return 'conflict';
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(plot)) out[k === key ? to : k] = v;
	fm[PLOT_TEXT] = out;
	return 'renamed';
}

/** Removes a plotline's key from a note's `plot` map in place; the property goes when nothing is left in it. */
export function dropPlotKey(fm: Record<string, unknown>, name: string): boolean {
	const plot = fm[PLOT_TEXT];
	if (!isObj(plot)) return false;
	const key = plotKey(plot, name);
	if (key == null) return false;
	delete plot[key];
	if (!Object.keys(plot).length) delete fm[PLOT_TEXT];
	return true;
}
