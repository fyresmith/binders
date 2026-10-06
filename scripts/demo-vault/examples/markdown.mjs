// "What Markdown becomes": a binder with a scene for each row of the table of that name in docs/dev/export.md. Each
// scene's synopsis says what an export should do with it, so an exported file can be checked by eye against the doc.
import { picture } from '../png.mjs';
import { EMBEDDED, JOIN, ROWS_1 } from './markdown-1.mjs';
import { ROWS_2 } from './markdown-2.mjs';
import { binder, file, folder, scene } from './shape.mjs';

/** Every row's scene, in the table's order: [name, synopsis, text, other properties]. */
export const ROWS = [...ROWS_1, ...ROWS_2];

export function markdown(add) {
	const row = ([name, synopsis, body, props]) => scene(name, { synopsis, ...props }, body);
	const items = [];
	for (const r of ROWS) {
		items.push(row(r));
		if (r[0].startsWith('06 ')) items.push(folder('06 The join of two scenes', JOIN.map(row), { synopsis: 'A chapter of two scenes: where one note ends and the next begins, the book has a scene break.' }));
	}
	const pic = picture(240, 120, [235, 235, 238]).frame(8, 8, 224, 104, [90, 90, 100], 4).line(20, 100, 220, 20, [200, 60, 50], 4).png();
	items.push(folder('What the scenes embed', [
		// (written as they are: one has properties of its own)
		...Object.entries(EMBEDDED).map(([name, text]) => scene(name, undefined, text)),
		file('sample-picture.png', pic),
	], { export: false, synopsis: 'A note and a picture that the scenes above embed. Left out of export as a folder.' }));
	return binder(add, 'What Markdown becomes', {
		title: 'What Markdown becomes', author: 'Binders', language: 'en-GB',
		synopsis: 'One scene for each kind of content an export has to decide about. Each synopsis says what should happen to it.',
	}, 'The rows of “What Markdown becomes” in the Binders project’s `docs/dev/export.md`, in order. Export this binder and read the file beside the corkboard.\n', items);
}
