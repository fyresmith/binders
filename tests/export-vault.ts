import { parts } from '../src/scene-text';
import { pictureOf } from '../src/export/picture';
import type { Resolver } from '../src/export/book';
import type { SourceItem } from '../src/export/roles';

/* A vault held in memory (path → contents) read as export's reader reads a real one, for the unit tests: each binder
   as items in binder order, and what its notes embed. Not the plugin's own reader (that is src/export/read.ts, which
   needs Obsidian, and has its e2e tests): the order here is the binder note's `contents` as written, then the rest
   by name. */

export type Files = Map<string, string | Uint8Array>;
export interface TestBinder { folder: string; name: string; items: SourceItem[]; resolve: Resolver; embedded: (target: string) => string | null }

const text = (files: Files, path: string): string | null => { const d = files.get(path); return typeof d === 'string' ? d : null; };
const off = (yaml: string): boolean => /^(export|compile):[ \t]*false[ \t]*$/m.test(yaml);
const exportAs = (yaml: string): string | undefined => /^export-as:[ \t]*["']?([^"'\n]+?)["']?[ \t]*$/m.exec(yaml)?.[1];
/** A `contents` list, read: one entry to a line, quoted or bare. */
const contents = (yaml: string): string[] => {
	const m = /^contents:[ \t]*\n((?:[ \t]+- .*(?:\n|$))*)/m.exec(yaml);
	return m ? m[1].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const v = l.slice(2).trim(); try { return v.startsWith('"') ? JSON.parse(v) as string : v.replace(/^'(.*)'$/, '$1'); } catch { return v; } }) : [];
};

export function bindersOf(files: Files): TestBinder[] {
	const out: TestBinder[] = [], paths = [...files.keys()];
	for (const path of paths) {
		const t = path.endsWith('.md') ? text(files, path) : null;
		if (t == null) continue;
		const yaml = parts(t).yaml;
		if (!/^binder:/m.test(yaml)) continue;
		const folder = path.slice(0, path.lastIndexOf('/'));
		// (a binder inside a binder is an ordinary note there, and a newer format is read all the same)
		if (!folder || out.some((b) => folder.startsWith(b.folder + '/')) || paths.some((p) => p !== path && p.startsWith(folder + '/') && p.split('/').length === path.split('/').length && /^binder:/m.test(parts(text(files, p) ?? '').yaml) && p < path)) continue;
		const order = contents(yaml);
		const walk = (dir: string): SourceItem[] => {
			const kids = new Map<string, 'note' | 'folder'>();
			for (const p of paths) {
				if (!p.startsWith(dir + '/')) continue;
				const rest = p.slice(dir.length + 1), slash = rest.indexOf('/');
				if (slash >= 0) kids.set(rest.slice(0, slash), 'folder'); else if (rest.endsWith('.md')) kids.set(rest, 'note');
			}
			const dirName = dir.split('/').pop() ?? '', rel = (name: string, kind: string) => `${dir === folder ? '' : dir.slice(folder.length + 1) + '/'}${kind === 'folder' ? name + '/' : name.replace(/\.md$/, '')}`;
			const place = (name: string, kind: string) => { const i = order.indexOf(rel(name, kind)); return i < 0 ? Infinity : i; };
			const names = [...kids.keys()].filter((n) => !(kids.get(n) === 'note' && (`${dir}/${n}` === path || n === `${dirName}.md`)) && !(dir === folder && n === 'Snapshots'));
			names.sort((a, b) => place(a, kids.get(a)) - place(b, kids.get(b)) || Number(kids.get(b) === 'folder') - Number(kids.get(a) === 'folder') || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
			return names.map((n): SourceItem => {
				if (kids.get(n) === 'folder') {
					const own = parts(text(files, `${dir}/${n}/${n}.md`) ?? '').yaml;
					return { kind: 'folder', name: n, path: `${dir}/${n}`, included: !off(own), exportAs: exportAs(own), children: walk(`${dir}/${n}`) };
				}
				const p = parts(text(files, `${dir}/${n}`) ?? '');
				return { kind: 'note', name: n.replace(/\.md$/, ''), path: `${dir}/${n}`, text: p.body, included: !off(p.yaml), exportAs: exportAs(p.yaml) };
			});
		};
		// what a note embeds is found by its name, as Obsidian finds it: the path, or a file of that name anywhere
		const find = (target: string): string | null => {
			const name = target.split(/[#|]/)[0].trim();
			for (const cand of [name, `${name}.md`]) { const hit = files.has(cand) ? cand : paths.find((p) => p.endsWith('/' + cand)); if (hit) return hit; }
			return null;
		};
		const embedded = (target: string): string | null => { const hit = /#/.test(target) ? null : find(target); return hit?.endsWith('.md') ? text(files, hit) : null; };
		const picture = (target: string) => { const hit = find(target), d = hit ? files.get(hit) : null; return d instanceof Uint8Array ? pictureOf(d) : null; };
		const resolve: Resolver = {
			embed: (target) => { const t = embedded(target); if (t != null) return { text: t }; const pic = picture(target); return pic ? { picture: pic } : null; },
			image: (src) => picture(src),
		};
		out.push({ folder, name: folder.split('/').pop() ?? folder, items: walk(folder), resolve, embedded });
	}
	return out;
}
