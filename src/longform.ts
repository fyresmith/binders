/* Longform projects (https://github.com/kevboh/longform) as binders. Pure, so it can be unit-tested, except
   `longformRunning` at the end, which reads an Obsidian internal.

   A Longform project is an index note whose properties have a `longform` object with `format: scenes`:

     longform:
       format: scenes
       sceneFolder: /          # relative to the index note's folder
       scenes:                 # scene file names (no .md), in order; a nested list is indented under the scene before it
         - Opening
         - Harbor
         - - Night watch
           - The letter
         - Departure
       ignoredFiles: [Notes*]  # names (wildcards * and ?) that aren't scenes

   Scenes are the notes directly in the scene folder. Binders reads `scenes` as a flat order with an indent per scene
   (as Longform does), and writes back only `longform.scenes`, in the nested shape Longform itself writes. Everything else
   in the note, and in `longform`, is left alone. Single-note projects (`format: single`) aren't binders. */
import type { App } from 'obsidian';

/** A scene in Longform's order: its file name, how far it's indented, and the value as the list had it (so a scene
    named "1984", which YAML reads as a number, is written back as it was). */
export interface Scene { title: string; indent: number; raw: unknown }

/** A Longform multi-scene project, as its index note says it. */
export interface Project {
	/** The scene folder, relative to the index note's folder ("/" or "" for the same folder). */
	sceneFolder: string;
	/** Listed scenes in order, first entry of each name only. */
	scenes: Scene[];
	/** `ignoredFiles` patterns. */
	ignored: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const titleOf = (v: unknown): string | null => (typeof v === 'string' ? v.trim() || null : typeof v === 'number' ? String(v) : null);

/** Is this frontmatter a Longform multi-scene project's index note? */
export function isLongformIndex(fm: unknown): boolean {
	return isObj(fm) && isObj(fm.longform) && fm.longform.format === 'scenes';
}

/** The project in an index note's frontmatter, or null if it isn't one. */
export function readProject(fm: unknown): Project | null {
	if (!isLongformIndex(fm)) return null;
	const lf = (fm as { longform: Record<string, unknown> }).longform;
	const sceneFolder = typeof lf.sceneFolder === 'string' ? lf.sceneFolder : '/';
	const ignored = (Array.isArray(lf.ignoredFiles) ? lf.ignoredFiles : []).filter((x): x is string => typeof x === 'string' && !!x);
	return { sceneFolder, scenes: flatten(lf.scenes), ignored };
}

/** Longform's nested arrays as a flat list with indents: `['A', ['B', 'C'], 'D']` is A 0, B 1, C 1, D 0. Blanks,
    objects and repeated names are skipped (the first one counts). */
export function flatten(v: unknown): Scene[] {
	const out: Scene[] = [], seen = new Set<string>();
	const walk = (arr: unknown[], indent: number) => {
		for (const x of arr) {
			if (Array.isArray(x)) { walk(x, indent + 1); continue; }
			const t = titleOf(x);
			if (t == null || seen.has(t)) continue;
			seen.add(t); out.push({ title: t, indent, raw: x });
		}
	};
	if (Array.isArray(v)) walk(v, 0);
	return out;
}

/** The flat list back in Longform's nested shape: the same algorithm as Longform's `indentedScenesToArrays`, so what
    Binders writes is what Longform would write for the same order. */
export function nest(scenes: Scene[]): unknown[] {
	const root: unknown[] = [], at: unknown[][] = [root];
	let cur = 0;
	for (const s of scenes) {
		if (s.indent > cur) {
			while (cur < s.indent) { const inner: unknown[] = []; at[cur].push(inner); at[++cur] = inner; }
		} else cur = s.indent;
		at[cur].push(s.raw);
	}
	return root;
}

/** Longform's `ignoredFiles` wildcards: `*` any text, `?` one character, the whole name. */
export function isIgnored(name: string, patterns: string[]): boolean {
	return patterns.some((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\/&=!,]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(name));
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The scenes as they show: listed ones whose note exists, in order, then notes the list doesn't mention (and
    `ignoredFiles` doesn't match), by name, at the top level. `files` are the names of the notes in the scene folder,
    without the index note. */
export function shownScenes(scenes: Scene[], files: string[], ignored: string[]): Scene[] {
	const have = new Set(files), listed = scenes.filter((s) => have.has(s.title)), named = new Set(listed.map((s) => s.title));
	const rest = files.filter((f) => !named.has(f) && !isIgnored(f, ignored)).sort(byName);
	return [...listed, ...rest.map((title) => ({ title, indent: 0, raw: title }))];
}

/** A change to the order waiting to be written, applied to whatever the index note says when it's written. `move` puts
    a scene at `index` among the scenes as they show; `indent` is its new indent (default: its own, or for a scene not
    listed yet, that of the scene before it). */
export type SceneOp =
	| { op: 'rename'; from: string; to: string }
	| { op: 'remove'; item: string }
	| { op: 'move'; item: string; index: number; indent?: number }
	/** A scene deleted and made again a moment later, back where it stood: after `prev`, or before `next`, or first
	    if it was first, or last, at the indent it had. Only if the list doesn't mention it (a list that came in with
	    the note already says where it goes). */
	| { op: 'restore'; item: string; prev: string | null; next: string | null; indent: number };

/** Applies a batch of changes to the listed scenes. Listed scenes whose note is gone are dropped (as Longform drops
    them); unlisted notes are only written into the list when a move needs them to keep their place. */
export function applySceneOps(scenes: Scene[], ops: SceneOp[], files: string[], ignored: string[]): Scene[] {
	const have = new Set(files);
	let list = scenes;
	for (const o of ops) {
		if (o.op === 'rename') {
			// a note renamed onto a name the list already has: the list keeps one entry, at the renamed scene's place
			if (list.some((s) => s.title === o.from)) list = list.filter((s) => s.title !== o.to);
			list = list.map((s) => (s.title === o.from ? { ...s, title: o.to, raw: o.to } : s));
		}
		else if (o.op === 'remove') list = list.filter((s) => s.title !== o.item);
		else if (o.op === 'restore') {
			if (list.some((s) => s.title === o.item)) continue;
			const i = list.findIndex((s) => s.title === o.prev), k = list.findIndex((s) => s.title === o.next);
			const at = o.prev != null && i >= 0 ? i + 1 : o.next != null && k >= 0 ? k : o.prev == null ? 0 : list.length;
			list = [...list.slice(0, at), { title: o.item, indent: Math.max(0, Math.floor(o.indent)), raw: o.item }, ...list.slice(at)];
		}
		else {
			// (the moved scene counts as there even if its note isn't yet; once, or it would be listed twice)
			const shown = shownScenes(list, [...new Set([...have, o.item])], ignored);
			const from = shown.findIndex((s) => s.title === o.item);
			// (a note the project ignores has no place in it: nothing moves, least of all some other scene)
			if (from < 0) continue;
			const wasListed = list.some((s) => s.title === o.item);
			const [it] = shown.splice(from, 1);
			const at = Math.max(0, Math.min(o.index, shown.length));
			const indent = o.indent ?? (wasListed ? it.indent : at > 0 ? shown[at - 1].indent : 0);
			shown.splice(at, 0, { ...it, indent: Math.max(0, Math.floor(indent)) });
			// keep listed everything up to the last scene that was listed, or the moved one; the rest stays unlisted
			const lastListed = Math.max(at, ...shown.map((s, i) => (i !== at && list.some((l) => l.title === s.title) ? i : -1)));
			list = shown.slice(0, lastListed + 1);
		}
	}
	return list.filter((s) => have.has(s.title));
}

/** Are two orders the same (names and indents)? */
export function sameScenes(a: Scene[], b: Scene[]): boolean {
	return a.length === b.length && a.every((s, i) => s.title === b[i].title && s.indent === b[i].indent);
}

/** Writes an order into an index note's frontmatter, in place: only `longform.scenes` changes. */
export function writeScenes(fm: Record<string, unknown>, scenes: Scene[]): void {
	(fm.longform as Record<string, unknown>).scenes = nest(scenes);
}

/** A run of scenes that belong together: `depth` is their indent, `head` the scene they're indented under (null at the
    top level, or for scenes indented under nothing). */
export interface SceneGroup { head: string | null; depth: number; scenes: string[] }

/** The groups the scenes show in, in order: a new group starts wherever the indent or the scene above changes. */
export function sceneGroups(shown: Scene[]): SceneGroup[] {
	const out: SceneGroup[] = [];
	shown.forEach((s, i) => {
		let head: string | null = null;
		for (let j = i - 1; j >= 0; j--) if (shown[j].indent < s.indent) { head = shown[j].title; break; }
		const last = out[out.length - 1];
		if (last && last.depth === s.indent && last.head === head) last.scenes.push(s.title);
		else out.push({ head, depth: s.indent, scenes: [s.title] });
	});
	return out;
}

/** "Convert to binder": the binder's `contents` for these scenes and, if `folders`, which scenes move into which
    subfolder. Each top-level scene with scenes indented under it gets a subfolder named after it, next to it, holding
    everything indented under it (deeper indents flattened). Scenes indented under nothing go in "Group 1", "Group 2"…
    `taken(name)` says whether a subfolder name is already used by something else in the folder. */
export function conversionPlan(shown: Scene[], folders: boolean, taken: (name: string) => boolean = () => false): { contents: string[]; moves: { scene: string; folder: string }[] } {
	const contents: string[] = [], moves: { scene: string; folder: string }[] = [];
	let folder: string | null = null, n = 0;
	const used = new Set<string>();
	shown.forEach((s, i) => {
		if (!folders || s.indent === 0) {
			folder = null;
			contents.push(s.title);
			if (folders && shown[i + 1] && shown[i + 1].indent > 0) folder = free(s.title);
			return;
		}
		if (folder == null) folder = free(`Group ${++n}`);
		if (!contents.includes(folder + '/')) contents.push(folder + '/');
		contents.push(`${folder}/${s.title}`);
		moves.push({ scene: s.title, folder });
	});
	function free(name: string): string {
		let f = name;
		// a folder can't share its name with a scene that moves into it: that note would become its folder note
		for (let k = 2; used.has(f) || taken(f) || shown.some((x) => x.indent > 0 && x.title === f); k++) f = `${name} ${k}`;
		used.add(f);
		return f;
	}
	return { contents, moves };
}

/** Whether the Longform plugin is running. It keeps `scenes` in step with renames and deletes itself, so Binders then
    leaves that to it. Internal: `app.plugins.plugins` (see docs/dev/internals.md); if it's missing, Binders does it. */
export function longformRunning(app: App): boolean {
	const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
	return !!plugins && typeof plugins === 'object' && !!plugins.longform;
}
