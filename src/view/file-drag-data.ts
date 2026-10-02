/* The parts of a file drag (file-drag.ts) that only reckon: no Obsidian, no document. */

export interface Box { left: number; top: number; right: number; bottom: number }

/** Is (x, y) in the box, its edges included? */
export const within = (r: Box, x: number, y: number): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** How near a list's top or bottom edge a drag held there scrolls it. */
export const EDGE = 32;

/** How far a list scrolls in one frame under a drag held at `y`, `heldMs` after it came to the edge: nothing away from
    its top and bottom edges; near one, gently, then faster the nearer the edge and the longer it's held there (twice
    as fast each second, up to eight times), as a list does under a real drag. Negative is up. */
export function edgeScroll(y: number, top: number, bottom: number, heldMs: number, edge = EDGE): number {
	// (a list shorter than two edges has no middle to rest in: it doesn't scroll for a drag at all)
	if (bottom - top < edge * 2) return 0;
	const v = y < top + edge ? -(top + edge - y) : y > bottom - edge ? y - (bottom - edge) : 0;
	if (!v) return 0;
	const depth = Math.min(1, Math.abs(v) / edge);
	return Math.sign(v) * Math.max(1, 12 * depth * depth) * Math.min(8, 2 ** (Math.max(0, heldMs) / 1000));
}

/** What a drop would do, as the browser has it after a `dragover`: what the place under the pointer said ('move',
    'link', 'copy'), if it took the event or is text being edited (which takes a drop without saying so); else 'none'. */
export function dropEffect(taken: boolean, editable: boolean, said: string): string {
	return taken || editable ? said || 'none' : 'none';
}

/** The words Obsidian puts on several dragged things at once ("3 files", "2 files and 1 folders": its own wording). */
export function countTitle(files: number, folders: number): string {
	return folders > 0 && files > 0 ? `${files} files and ${folders} folders` : folders > 0 ? `${folders} folders` : `${files} files`;
}
