/* The corkboard arranged by label, as data: which lines there are, what stands along them, how far apart they are, and what a drop
   means. A thread is a label's line; the cards stand along the lines in the binder's order, each in a place of its own,
   on its label's line (Scrivener's "Arrange by label"). Pure (no Obsidian, no page), so it can be unit-tested; the mode
   that draws it is lanes.ts. */

/** How the corkboard's cards are arranged: in a grid, or by label (this board). */
export type Arrangement = 'grid' | 'label';
export const readArrangement = (v: unknown): Arrangement => (v === 'label' ? 'label' : 'grid');

export type Lines = 'across' | 'down';
export const readLines = (v: unknown): Lines => (v === 'down' ? 'down' : 'across');

export const CARD_SIZES = ['small', 'medium', 'large'] as const;
export type CardSize = typeof CARD_SIZES[number];
export const readSize = (v: unknown, fallback: CardSize): CardSize => ((CARD_SIZES as readonly unknown[]).includes(v) ? v as CardSize : fallback);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The lines, in order: "" (no label) first, then the labels in settings as they're listed there (all of them, or
    with `unused` off only those a card has), then the other labels the cards have, as they first come. */
export function laneList(presets: readonly string[], used: readonly string[], unused: boolean): string[] {
	const has = (l: string) => used.some((u) => same(u, l));
	const out = ['', ...presets.filter((p) => p.trim() && (unused || has(p)))];
	for (const u of used) if (u.trim() && !out.some((o) => same(o, u))) out.push(u);
	return out;
}

/** The line a label is on (its place in `lanes`), any case; the first, "no label", if it has none of them. */
export function laneOf(label: string, lanes: readonly string[]): number {
	const i = label.trim() ? lanes.findIndex((l) => same(l, label)) : 0;
	return i < 0 ? 0 : i;
}

/** How far apart the lines are, in pixels: a card apart (and a little) where there's room for all of them; closer when
    there are many, down to a little over half a card. Cards on neighbouring lines never share a place, so they may
    pass each other, and at half a card apart each still leaves the next line in sight. `size` is a card's height
    (lines across) or width (lines down), `room` what the pane has that way. */
export function lanePitch(size: number, room: number, lanes: number): number {
	const least = size / 2 + 8, most = size + 12;
	if (lanes < 2) return Math.round(most);
	return Math.round(Math.min(most, Math.max(least, (room - size) / (lanes - 1))));
}

/** Notes that stand together: a folder's, up to its next subfolder. `end`: the folder's item just after them (null:
    the folder's end). `divider`: the run starts under its folder's name (every run but the first). */
export interface Run<F, T> { folder: F; items: T[]; end: T | null; divider: boolean }

/** Everything under a folder in the binder's order, as runs, for a board that shows the notes inside subfolders too.
    An empty run is kept where it's somewhere to put a card: a folder's start, and the end of the folder shown. */
export function flatRuns<F extends T, T>(top: F, children: (folder: F) => T[], isFolder: (x: T) => x is F): Run<F, T>[] {
	const out: Run<F, T>[] = [];
	const walk = (folder: F) => {
		let run: T[] = [], first = true;
		const flush = (end: T | null) => {
			if (run.length || first || (folder === top && end === null)) out.push({ folder, items: run, end, divider: out.length > 0 });
			run = [];
			first = false;
		};
		for (const c of children(folder)) {
			if (isFolder(c)) { flush(c); walk(c); } else run.push(c);
		}
		flush(null);
	};
	walk(top);
	return out;
}

/** What stands along the lines, in order: a card (`id`, its path), or a folder's name (`id` null) where a run begins. */
export interface Stop { run: number; id: string | null }

/** The stop a pointer at `pos` (along the lines) would put something before: the first whose middle is past it
    (`reverse`: the lines run the other way, right to left); `mids.length` for after them all. */
export function insertAt(mids: readonly number[], pos: number, reverse = false): number {
	const i = mids.findIndex((m) => (reverse ? pos > m : pos < m));
	return i < 0 ? mids.length : i;
}

/** Where a drop before stop `at` puts the cards being moved: in which run, before which card (`before` null: at the
    run's end), and whether that is where they already are (`stay`: the order doesn't change). Before a folder's name
    is the end of what comes before it. `held`: the card of them that the pointer has hold of. */
export interface Place { run: number; before: string | null; stay: boolean }

export function resolveDrop(stops: readonly Stop[], at: number, moving: ReadonlySet<string>, held?: string): Place {
	// Several cards in hand, let go where the one that's held already is (a drag straight across, to another line):
	// they all stay where they are, apart or not. Only a drag along the lines brings them together.
	if (held != null && moving.size > 1 && resolveDrop(stops, at, new Set([held])).stay) {
		const own = stops.find((q) => q.id === held);
		return { run: own?.run ?? 0, before: null, stay: true };
	}
	const s = stops[at], prev = stops[at - 1];
	const run = s?.id != null ? s.run : prev ? prev.run : 0;
	const order: string[] = [];
	for (const q of stops) if (q.run === run && q.id != null) order.push(q.id);
	const before = stops.slice(at).find((q) => q.run === run && q.id != null && !moving.has(q.id))?.id ?? null;
	let stay = false;
	if ([...moving].every((m) => order.includes(m))) {
		const rest = order.filter((p) => !moving.has(p)), k = before == null ? rest.length : rest.indexOf(before);
		const result = [...rest.slice(0, k), ...order.filter((p) => moving.has(p)), ...rest.slice(k)];
		stay = result.every((p, i) => p === order[i]);
	}
	return { run, before, stay };
}

/** The line whose band a point is in, or the nearest: `bands` are each line's start and end across the lines. */
export function laneAt(bands: readonly (readonly [number, number])[], c: number): number {
	let best = 0, least = Infinity;
	bands.forEach(([a, b], i) => {
		const lo = Math.min(a, b), hi = Math.max(a, b), d = c < lo ? lo - c : c > hi ? c - hi : 0;
		if (d < least) { least = d; best = i; }
	});
	return best;
}

/** The card to go to from card `i` with an arrow across the lines: the nearest in place on the nearest line that way
    (`dir` 1: the lines after its own). -1 if there's none. */
export function beside(cards: readonly { lane: number; slot: number }[], i: number, dir: 1 | -1): number {
	const from = cards[i];
	if (!from) return -1;
	let best = -1, score = Infinity;
	cards.forEach((c, k) => {
		const dl = (c.lane - from.lane) * dir;
		if (dl <= 0) return;
		const sc = dl * 1e6 + Math.abs(c.slot - from.slot);
		if (sc < score) { score = sc; best = k; }
	});
	return best;
}

/** What a change was, for "Undo": `names` the cards' titles, `label` the label they were given as it's shown ("" for
    none; null: it didn't change), `moved` whether their places changed. */
export function changeText(names: readonly string[], label: string | null, moved: boolean): string {
	const one = names.length === 1, what = one ? `“${names[0]}”` : `${names.length} items`;
	if (label == null) return `Move ${what}`;
	if (!moved) return label ? `Label ${what} as ${label}` : `Remove the label of ${what}`;
	return label ? `Move ${what} and label ${one ? 'it' : 'them'} ${label}` : `Move ${what} and remove ${one ? 'its label' : 'their labels'}`;
}

/** What a screen reader is told when cards change line. */
export function announceText(names: readonly string[], label: string): string {
	const what = names.length === 1 ? names[0] : `${names.length} items`;
	return label ? `${what}: label ${label}` : `${what}: no label`;
}
