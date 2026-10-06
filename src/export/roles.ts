import { STRUCTURES, numberWords, type Role, type Structure } from './model';

/* Which note and folder plays which part in the book: the one structure rule, Binders' guess at it, and what a
   writer's `export-as` overrules. Pure. The design is docs/export.md, "The model". */

/** A note or folder of the binder, as export is handed it: in binder order, a note with its text (properties off). */
export interface SourceItem {
	kind: 'note' | 'folder';
	name: string;
	path: string;
	text?: string;
	/** Its `export-as` property, as written (a folder's is in its folder note). */
	exportAs?: unknown;
	/** False for `export: false` (or `compile: false`). */
	included: boolean;
	children?: SourceItem[];
}

/** An item with the role it was given. */
export interface Placed { item: SourceItem; depth: number; role: Role; auto: Role }

/** `export-as` as written, read: a role, or null for anything else (which is "automatic"). */
export function readRole(v: unknown): Role | null {
	if (typeof v !== 'string') return null;
	const s = v.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
	if (s === 'part' || s === 'chapter' || s === 'scene') return s;
	if (s === 'front' || s === 'front matter') return 'front';
	if (s === 'back' || s === 'back matter') return 'back';
	return null;
}
/** A role as `export-as` is written. */
export const writeRole = (r: Role): string => (r === 'front' ? 'front matter' : r === 'back' ? 'back matter' : r);

/** `structure` in a binder note, read: one of the four rules, or null (then it is guessed). */
export function readStructure(v: unknown): Structure | null {
	if (typeof v !== 'string') return null;
	const s = v.trim().toLowerCase();
	for (const k of Object.keys(STRUCTURES) as Structure[]) if (s === k || s === STRUCTURES[k][0]) return k;
	return null;
}

const MATTER_FOLDER = /^(front|back)[ -]?matter$/i;
/** Names that make a note at the book's start or end front or back matter. */
const MATTER = /^(dedication|epigraph|acknowledge?ments|about the author|also by\b.*|copyright|title page)$/i;
const PARTLIKE = /^(part|book|act)\b/i;

/** A folder that counts toward the guess: one with a note to export somewhere in it (a folder of pictures has none). */
const holds = (it: SourceItem): boolean => it.kind === 'folder' && it.included && !MATTER_FOLDER.test(it.name.trim()) && (it.children ?? []).some((c) => c.included && (c.kind === 'note' || holds(c)));

/** How deep the folders go that hold something to export. */
function depthOf(items: readonly SourceItem[]): number {
	let d = 0;
	for (const it of items) if (holds(it)) d = Math.max(d, 1 + depthOf(it.children ?? []));
	return d;
}

/** The rule guessed from a binder's shape: how deep it goes, and whether its top folders are named as parts. */
export function guessStructure(items: readonly SourceItem[]): Structure {
	const depth = depthOf(items);
	if (depth === 0) return 'notes';
	if (depth > 1) return 'parts-chapters';
	const folders = items.filter(holds);
	return folders.length && folders.every((f) => PARTLIKE.test(f.name.trim())) ? 'parts' : 'chapters';
}

/** What a folder is by the rule alone, given what it is in. */
function folderRole(structure: Structure, within: 'top' | 'part' | 'chapter'): Role {
	if (structure === 'chapters') return within === 'top' ? 'chapter' : 'group';
	if (structure === 'parts') return within === 'top' ? 'part' : 'group';
	if (structure === 'parts-chapters') return within === 'top' ? 'part' : within === 'part' ? 'chapter' : 'group';
	return 'group';
}

/** Every item of the binder, in order, with its role. `deep`: the folders the rule doesn't reach, which only group
    their notes (a warning says so). */
export function assignRoles(items: readonly SourceItem[], structure: Structure): { placed: Placed[]; deep: SourceItem[] } {
	const placed: Placed[] = [], deep: SourceItem[] = [];
	// notes with a front- or back-matter name before the first thing that isn't one, and after the last
	const named = (it: SourceItem) => it.kind === 'note' && it.included && MATTER.test(it.name.trim());
	let lead = 0, tail = items.length;
	while (lead < items.length && (named(items[lead]) || !items[lead].included)) lead++;
	while (tail > lead && (named(items[tail - 1]) || !items[tail - 1].included)) tail--;
	const walk = (list: readonly SourceItem[], depth: number, within: 'top' | 'part' | 'chapter', matter: 'front' | 'back' | null) => {
		list.forEach((it, i) => {
			if (!it.included) { placed.push({ item: it, depth, role: 'out', auto: 'out' }); return; }
			const said = readRole(it.exportAs);
			if (it.kind === 'note') {
				const byPlace = depth === 0 && named(it) ? (i < lead ? 'front' : i >= tail ? 'back' : null) : null;
				const auto: Role = matter ?? byPlace ?? (within === 'chapter' ? 'scene' : 'chapter');
				placed.push({ item: it, depth, role: said ?? auto, auto });
				return;
			}
			const m = MATTER_FOLDER.exec(it.name.trim());
			const auto: Role = matter ?? (m ? (m[1].toLowerCase() as 'front' | 'back') : folderRole(structure, within));
			// (a folder can't be a scene: said to be one, it holds scenes)
			const role: Role = said === 'scene' ? 'group' : said ?? auto;
			if (role === 'group' && auto === 'group' && structure !== 'notes' && !said) deep.push(it);
			placed.push({ item: it, depth, role, auto });
			const inside = role === 'part' ? 'part' : role === 'chapter' || said === 'scene' ? 'chapter' : within;
			walk(it.children ?? [], depth + 1, inside, role === 'front' || role === 'back' ? role : matter);
		});
	};
	walk(items, 0, 'top', null);
	return { placed, deep };
}

/** A number as a name may spell it: figures, Roman numerals, or words up to ninety-nine. */
const SPELLED = Array.from({ length: 99 }, (_, i) => numberWords(i + 1).toLowerCase().replace('-', '[- ]')).reverse().join('|');
const BARE = `(?:\\d+|${SPELLED})`, NUMBER = `(?:\\d+|[ivxlcdm]+|${SPELLED})`;
// (a Roman numeral counts only after "Chapter" or "Part": alone, "Mix" and "Lid" are names)
const ONLY_NUMBER = new RegExp(`^(?:(?:chapter|part|book|act)\\s+${NUMBER}|${BARE})$`, 'i');
const NUMBERED = new RegExp(`^(?:chapter|part|book|act)\\s+${NUMBER}\\s*[-–—:.]\\s*`, 'i');
/** Chapters that have a name and no number. */
export const UNNUMBERED = /^(prologue|epilogue|interlude|introduction|foreword|preface|afterword)$/i;

/** A chapter's or part's title from its note's or folder's name: without the number it starts with ("03 - Storm
    warning" is "Storm warning"), and nothing if the name is only a number, "Chapter 3" or "Part One". */
export function titleFrom(name: string): string {
	let s = name.trim().replace(NUMBERED, '');
	if (ONLY_NUMBER.test(s)) return '';
	s = s.replace(/^\d+\s*[-–—.:)]*\s*/, '').trim();
	return ONLY_NUMBER.test(s) ? '' : s;
}
