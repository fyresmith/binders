import { escapeMarkdown } from './markdown';

/* What every import hands to writeImport (vault.ts): the files to make, and the rows the dialog shows. */

/** A row of what will be made, in the binder's order: a note, or a folder (whose `path` is its folder note's). */
export interface PlannedNote {
	path: string; title: string; body: string; folder: boolean; depth: number;
	/** Left out of an export: research, or a document with "Include in compile" off. */
	out: boolean;
	status: string;
	/** The source heading a chapter or part was named from, exactly as the source has it (the word-for-word test reads it). */
	heading?: string;
}
/** Something the writer should know about one item, as the dialog lists it: the note it is about (its path in the
    plan, "" when it is about no note), its title, and what is said. */
export interface Said { path: string; name: string; text: string }
export interface ImportPlan {
	name: string;
	/** Every file to make, by its path in the vault. The binder note is among them, and is written last. */
	files: Map<string, Uint8Array>;
	/** Every folder to make, a folder before what is in it. */
	folders: string[];
	notes: PlannedNote[];
	/** What is said, as lines for the binder note ("Arrival: ..."), and by item for the dialog. */
	warnings: string[];
	said: Said[];
	/** Labels and statuses the project has and the vault's settings don't. */
	labels: { name: string; color: string }[];
	statuses: string[];
	sceneCount: number; snapshotCount: number; trashCount: number;
}
/** A title as a file's name on any system: no character a path or a link reads, no dot or space at either end, not
    one of the names Windows keeps for itself, a hundred characters at most. Never empty. */
export function safeName(name: string): string {
	const cleaned = [...name.normalize('NFC')].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('').replace(/[*"\\/<>:|?#[\]^]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
	const safe = [...cleaned].slice(0, 100).join('').replace(/[. ]+$/, '') || 'Untitled';
	return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safe) ? `Original ${safe}` : safe;
}

/** Two names that are one file on a disk that doesn't tell upper case from lower, or one way of writing "é" from another. */
export const key = (s: string) => s.normalize('NFC').toLowerCase();

/** Is this a place import may write: the binder's folder, or under it by steps that are each a name a vault on any
    system holds (not empty, not led by a dot, not ended by a dot or a space, no backslash)? Every path is made from
    names passed through `safeName`, so this is never false; it is asked all the same before a path is planned and
    again before it is written, because a path that climbed out would be a note written over someone's writing. */
export function inBinder(root: string, path: string): boolean {
	if (path === root) return true;
	return path.startsWith(root + '/') && path.slice(root.length + 1).split('/').every((step) => step !== '' && !/^\.|[. ]$|\\/.test(step));
}

/** A note as Obsidian would write it: a name as it is where YAML takes it so, a list as lines, and no block of
    properties at all for a note that has none. A value is written quoted, as JSON, which YAML reads as it is. */
export function note(props: Record<string, unknown>, body: string): string {
	const name = (k: string) => (/^[A-Za-z][\w-]*$/.test(k) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(k) ? k : JSON.stringify(k));
	const lines = Object.entries(props).map(([k, v]) => `${name(k)}:${Array.isArray(v) ? (v.length ? v.map((x) => `\n  - ${JSON.stringify(x)}`).join('') : ' []') : ` ${JSON.stringify(v)}`}`);
	return lines.length ? `---\n${lines.join('\n')}\n---\n${body}` : body;
}

/** A link to a file of the plan, by its whole path so it can't be taken for another of the same name. A path a
    wikilink can't hold (`#`, `|`, `^`, a bracket) is a Markdown link instead. */
export function link(path: string, label: string, image = false): string {
	if (/[#[\]|^]/.test(path)) return `${image ? '!' : ''}[${escapeMarkdown(label)}](${path.split('/').map(encodeURIComponent).join('/').replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))})`;
	return `${image ? '!' : ''}[[${image ? path : `${path.replace(/\.md$/i, '')}|${label.replace(/[|\]\r\n]/g, ' ')}`}]]`;
}

