// A binder written from its shape: a tree of notes and folders, in order. What the example books share.
import { note } from '../core.mjs';
import { wordsIn } from '../prose.mjs';

/** A note of a binder: its name, properties and text. */
export const scene = (name, props, body = '') => ({ name, props, body });
/** A folder of a binder: its name, what is in it, and its folder note's properties and text (none: no folder note). */
export const folder = (name, items, props, body = '') => ({ name, items, props, body });

/** A file of a binder that is not a note (a picture): its name with its extension, and its bytes. */
export const file = (name, data) => ({ name, data });

/** Writes a binder: every note, each folder's note, and the binder note with `contents` in the tree's order.
    `unlisted` names notes (by path in the binder) that are written and left out of `contents`. Returns what was
    counted on the way: the words of the notes that go into an export, and how many notes and folders there are. */
export function binder(add, name, props, body, items, { unlisted = [] } = {}) {
	const contents = [], tally = { words: 0, notes: 0, folders: 0 };
	const walk = (list, dir, out) => {
		for (const it of list) {
			const path = dir + it.name, off = out || it.props?.export === false;
			if (it.items) {
				contents.push(path + '/');
				tally.folders++;
				if (it.props || it.body) add(`${path}/${it.name}.md`, note(it.props, it.body));
				walk(it.items, path + '/', off);
			} else if (it.data !== undefined) {
				contents.push(path);
				add(path, it.data);
			} else {
				// (a note named like its folder would be the folder's note, and no scene)
				if (it.name === dir.split('/').slice(-2)[0] || (!dir && it.name === name)) throw new Error(`${name}: the note ${path} is named like its folder`);
				if (!unlisted.includes(path)) contents.push(path);
				tally.notes++;
				if (!off) tally.words += wordsIn(it.body);
				add(`${path}.md`, note(it.props, it.body));
			}
		}
	};
	walk(items, '', false);
	add(`${name}.md`, note({ binder: 1, contents, ...props }, body));
	return tally;
}

/** A status for each of `n` scenes in order, as a draft has them: the early ones finished, the late ones barely
    begun. `done` is how far through the book the writer is, 0 to 1. */
export function statusAt(i, n, done, rand) {
	const at = i / Math.max(1, n - 1) + (rand() - 0.5) * 0.25;
	return at < done - 0.35 ? 'Done' : at < done - 0.1 ? 'Revised' : at < done + 0.25 ? 'Draft' : 'Idea';
}
