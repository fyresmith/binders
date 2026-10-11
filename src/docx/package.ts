import { unzipSync } from 'fflate';
import { MAX_BYTES, readZip, safePath, type ZipWording } from '../import/source';
import { events } from './xml';

/* A .docx as a package: a zip whose parts are found through its relationships, never by a fixed name. The zip's
   directory is checked before anything is inflated, pictures and other media are never inflated here (the plan
   asks for them when it needs them), and a part is held to a size. A file that begins like an older Word file or a
   locked one (Office's own container, not a zip) is refused in plain words. Pure. */

export const OLDER = 'This is an older Word file (.doc), or one locked with a password. In Word, save it as .docx with no password, then choose that.';
/** The most one picture may be, unpacked. */
export const MAX_MEDIA = 32 * 1024 * 1024;
/** The most one part of the file may be, unpacked. */
export const MAX_PART = 64 * 1024 * 1024;

const WORDING: ZipWording = {
	tooBig: 'This Word file is larger than import can hold (256 MB unpacked).',
	split: 'This Word file is split over several files, or too large to read here.',
	twin: 'This Word file has two parts of the same name, which can’t be told apart.',
	link: 'This Word file holds a link to a file elsewhere, which import won’t follow.',
	damaged: (path) => `“${path}” is damaged in this Word file. Open it in Word and save it again, then choose that.`,
};

export interface Rel { target: string; type: string; external: boolean }
export interface Package {
	parts: ReadonlyMap<string, Uint8Array>;
	/** The main document's part name ("word/document.xml"). */
	main: string;
	/** The main document's relationships, by id. */
	rels: ReadonlyMap<string, Rel>;
	/** Every part name in the zip that was inflated. */
	names: string[];
	/** One part inflated on request (a picture, when the plan needs it), or null. Held to a size. */
	media(name: string): Uint8Array | null;
}

function relsOf(xml: string, base: string): Map<string, Rel> {
	const out = new Map<string, Rel>();
	for (const e of events(xml)) {
		if (e.t !== 'open' || e.name !== 'Relationship') continue;
		const { Id, Target, Type, TargetMode } = e.attrs;
		if (!Id || !Target) continue;
		const external = TargetMode === 'External';
		let target = Target;
		if (!external) {
			const dir = base.slice(0, base.lastIndexOf('/') + 1);
			target = Target.startsWith('/') ? Target.slice(1) : dir + Target;
			// (a name that climbs is resolved, and refused if it leaves the package)
			const steps: string[] = [];
			for (const s of target.split('/')) { if (s === '..') { if (!steps.pop()) throw new Error('A link inside this Word file points outside it.'); } else if (s !== '.') steps.push(s); }
			target = steps.join('/');
		}
		out.set(Id, { target, type: Type ?? '', external });
	}
	return out;
}

const text = (b: Uint8Array): string => {
	try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { throw new Error('A part of this Word file isn’t the text it should be, and can’t be read.'); }
};

export function readPackage(data: Uint8Array): Package {
	if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) throw new Error(OLDER);
	if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('This isn’t a Word file (.docx).');
	const parts = readZip(data, { words: WORDING, filter: (name) => !/^word\/(media|embeddings|activeX)\//i.test(name) && !/\.(png|jpe?g|gif|bmp|tiff?|emf|wmf|bin)$/i.test(name) });
	const names: string[] = [];
	// (the directory's names, for what the plan asks about media: the filter kept them out of `parts`)
	for (const k of parts.keys()) names.push(safePath(k));
	const root = parts.get('_rels/.rels');
	if (!root || !parts.has('[Content_Types].xml')) throw new Error('This zip file isn’t a Word file: it has no document in it.');
	const main = [...relsOf(text(root), '').values()].find((r) => !r.external && /\/officeDocument$/.test(r.type))?.target;
	const bytes = main ? parts.get(main) : undefined;
	if (!main || !bytes) throw new Error('This zip file isn’t a Word file: it has no document in it.');
	if (bytes.length > MAX_PART || bytes.length > MAX_BYTES) throw new Error('This Word file’s text is larger than import can hold (64 MB).');
	const relName = `${main.slice(0, main.lastIndexOf('/') + 1)}_rels/${main.slice(main.lastIndexOf('/') + 1)}.rels`;
	const rels = parts.has(relName) ? relsOf(text(parts.get(relName) ?? new Uint8Array()), main) : new Map<string, Rel>();
	const media = (name: string): Uint8Array | null => {
		const got = unzipSync(data, { filter: (f) => f.name === name && f.originalSize <= MAX_MEDIA })[name];
		return got ?? null;
	};
	return { parts, main, rels, names, media };
}

export const partText = (p: Package, name: string): string | null => { const b = p.parts.get(name); return b ? text(b) : null; };
