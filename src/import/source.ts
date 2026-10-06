import { unzipSync } from 'fflate';

/* A Scrivener project in hand: its files by their path in the project, whether they came from a folder on the disk
   (desktop.ts) or from a zipped backup (here). The paths are names to look files up by and never paths to write
   to: nothing is written anywhere by what a project calls its files. They are held to a shape all the same (no
   climbing out, no drive, no backslash), and a project is held to a size, before any of it is unpacked. Pure. */

/** The most a project may be, unpacked: its files are all held in memory while it is read and planned. */
export const MAX_BYTES = 256 * 1024 * 1024;
export const MAX_FILES = 20_000;
/** What is said of a project past either. */
export const TOO_BIG = 'This project is larger than import can hold (256 MB, or 20,000 files).';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const b of data) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** Bytes as text, or an error: bytes that aren't UTF-8 are not read as something else. */
export function utf8(data: Uint8Array): string {
	try { return new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw new Error('A file in the project isn’t the text it should be, and can’t be read.'); }
}
export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** A file's path in a project, as it has to be: steps that are each a name, joined by "/". */
export function safePath(path: string): string {
	const unsafe = () => new Error('A file in the project has a name that can’t be read safely.');
	if (!path || path.length > 1024 || [...path].some((c) => c.charCodeAt(0) < 32) || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path)) throw unsafe();
	const parts = path.replace(/\/$/, '').split('/');
	if (parts.length > 80 || parts.some((p) => !p || p === '.' || p === '..')) throw unsafe();
	return parts.join('/');
}

export interface ProjectSource {
	/** The project's name: its `.scrivx` file's. */
	name: string;
	files: ReadonlyMap<string, Uint8Array>;
	/** Whether the project is still as it was read. A folder on the disk is asked again before anything is
	    imported; a zip's bytes are in hand, and can't have changed. */
	unchanged(): Promise<boolean>;
}

/** A zipped backup read. Its directory is walked first, by hand: how many files it holds and how large they are
    unpacked is known, and held to the limits, before anything is unpacked. What is then unpacked is checked against
    it, file by file. */
export function zipSource(data: Uint8Array, name: string): ProjectSource {
	if (data.length > MAX_BYTES) throw new Error(TOO_BIG);
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	// the end record, then the central directory it points at: a file's own header can leave its size out
	let end = -1;
	for (let at = data.length - 22; at >= Math.max(0, data.length - 65557); at--) {
		if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === data.length) { end = at; break; }
	}
	if (end < 0) throw new Error('This isn’t a zip file, or it has been cut short.');
	const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
	if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count > MAX_FILES || count === 65535 || start + size !== end) throw new Error('This backup is split over several files, or too large to read here.');
	let at = start, expanded = 0;
	const names = new Set<string>(), stamps = new Map<string, { size: number; crc: number }>();
	for (let i = 0; i < count; i++) {
		if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('This zip file is damaged.');
		const length = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), next = at + 46 + length + extra + comment;
		if (next > end || view.getUint16(at + 8, true) & 1) throw new Error('This zip file is damaged, or locked with a password.');
		const raw = utf8(data.subarray(at + 46, at + 46 + length)), key = safePath(raw).normalize('NFC').toLowerCase();
		if (names.has(key)) throw new Error('This backup has two files of the same name, which can’t be told apart.');
		names.add(key);
		stamps.set(raw, { size: view.getUint32(at + 24, true), crc: view.getUint32(at + 16, true) });
		// (a link, by its Unix mode: what it points at is not the project's)
		if (((view.getUint32(at + 38, true) >>> 16) & 0xf000) === 0xa000) throw new Error('This backup holds a link to a file elsewhere, which import won’t follow.');
		expanded += view.getUint32(at + 24, true);
		if (expanded > MAX_BYTES) throw new Error(TOO_BIG);
		at = next;
	}
	if (at !== end) throw new Error('This zip file is damaged.');
	const files = new Map<string, Uint8Array>();
	let actual = 0, entries = 0;
	for (const [path, bytes] of Object.entries(unzipSync(data))) {
		entries++;
		safePath(path);
		const expected = stamps.get(path);
		if (!expected || bytes.length !== expected.size || crc32(bytes) !== expected.crc) throw new Error(`“${path}” is damaged in the backup. Make a new backup in Scrivener, and choose that.`);
		if (path.endsWith('/')) continue;
		actual += bytes.length;
		if (actual > MAX_BYTES || files.size >= MAX_FILES) throw new Error(TOO_BIG);
		files.set(path, bytes);
	}
	if (entries !== stamps.size) throw new Error('This zip file is damaged.');
	return projectSource(files, name, () => Promise.resolve(true));
}

/** A project from a set of files: the one `.scrivx` among them says where it is (a backup holds the project's
    folder, and often a "__MACOSX" beside it), and the project's files are those beside it, by their paths from there. */
export function projectSource(files: ReadonlyMap<string, Uint8Array>, name: string, unchanged: () => Promise<boolean>): ProjectSource {
	const names = new Set<string>();
	let total = 0;
	for (const [path, bytes] of files) {
		// (two files that a disk which doesn't tell cases apart would hold as one: which is the project's can't be known)
		const key = safePath(path).normalize('NFC').toLowerCase();
		if (names.has(key)) throw new Error('This project has two files of the same name, which can’t be told apart.');
		names.add(key);
		total += bytes.length;
	}
	if (total > MAX_BYTES || files.size > MAX_FILES) throw new Error(TOO_BIG);
	const indexes = [...files.keys()].filter((p) => !p.startsWith('__MACOSX/') && /\.scrivx$/i.test(p));
	if (indexes.length !== 1) throw new Error(indexes.length ? 'This holds more than one Scrivener project. Choose a backup of a single project.' : 'There is no Scrivener project here: no file ending in .scrivx was found.');
	const index = indexes[0], prefix = index.slice(0, index.lastIndexOf('/') + 1), selected = new Map<string, Uint8Array>();
	for (const [path, bytes] of files) if (path.startsWith(prefix)) selected.set(path.slice(prefix.length), bytes);
	return { name: index.slice(prefix.length).replace(/\.scrivx$/i, '') || name.replace(/\.zip$/i, ''), files: selected, unchanged };
}
