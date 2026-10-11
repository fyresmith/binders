import { normalizePath, type App, type TFolder } from 'obsidian';
import { SNAPSHOTS } from '../snapshot-text';
import { EXT, fileName, parseFile, parseName, type DayLine, type ParsedFile } from './format';
import { Ledger, type Device } from './ledger';
import { merge, type Merged, type Source } from './merge';
import { yearOf } from './day';

/* The record of one binder's writing, on disk: its files in the binder's "Snapshots" folder, in "History", one for
   each device and year (the format is docs/dev/file-format.md's; the wording of what may be written there is golden
   rule 3's third exception in AGENTS.md).

   A device writes only its own file, and only numbers and names: never a note's text. The files of other devices are
   read, never written. Writing is to a temporary name and then moved into place, so a whole file is never replaced
   by half of one, and it fails quietly: nothing here throws into whoever is typing, and a write that didn't happen
   is tried again. */

export const HISTORY = 'History';

/** Where a binder's record is: the folder `History` in its folder of snapshots. */
export const historyDir = (folder: TFolder | string): string => normalizePath(`${typeof folder === 'string' ? folder : folder.path}/${SNAPSHOTS}/${HISTORY}`);

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

interface Other { path: string; mtime: number; size: number; device: string; name: string; file: ParsedFile }

export class BinderRecord {
	/** This device's years, as counted. */
	private ledgers = new Map<number, Ledger>();
	/** The other devices' files, as last read. */
	private others = new Map<string, Other>();
	private loading: Promise<void> | null = null;
	/** Our files were read (so a write can't replace what it didn't see). */
	private ok = false;
	/** Why nothing is written for this binder (the Snapshots folder is somebody's chapters), or null. */
	blocked: string | null = null;
	/** When `blocked` was last worked out (performance.now()). */
	checked = -Infinity;
	/** Forgotten (a test starting over): it writes nothing more. */
	dead = false;
	/** The writes that failed since one worked. */
	failures = 0;

	constructor(private app: App, readonly folder: TFolder, private who: () => Device) {}

	get dir(): string { return historyDir(this.folder); }

	/** This device's ledger for a year: made empty if it has none yet, and the file it may have is read in. */
	ledger(year: number): Ledger {
		let l = this.ledgers.get(year);
		if (!l) { l = new Ledger(this.who(), year); this.ledgers.set(year, l); }
		return l;
	}

	/** The ledger for a moment's year. */
	ledgerAt(day: string): Ledger { return this.ledger(yearOf(day)); }

	get dirty(): boolean { return [...this.ledgers.values()].some((l) => l.dirty && !l.locked); }

	/** Every ledger there is. */
	all(): Ledger[] { return [...this.ledgers.values()]; }

	// ---- reading ----

	/** Reads this device's files in, once (and again after a read that failed), and the other devices'. */
	load(): Promise<void> {
		this.loading ??= this.read().then(() => { this.ok = true; }, () => { this.loading = null; throw new Error('the record could not be read'); });
		return this.loading;
	}

	private async read(): Promise<void> {
		const a = this.app.vault.adapter, own = this.who();
		if (!(await a.exists(this.dir))) return;
		const list = await a.list(this.dir), taken = new Set<number>();
		const final = new Set(list.files.filter((f) => f.endsWith('.' + EXT)).map(baseName));
		for (const path of [...list.files].sort()) {
			let name = baseName(path), tmp = false;
			// A write cut off between taking the old file away and moving the new one in leaves the new one under its
			// temporary name: it is the file, unless the real one is there.
			if (name.endsWith('.' + EXT + '.tmp')) { name = name.slice(0, -4); tmp = true; if (final.has(name)) continue; }
			if (!name.endsWith('.' + EXT)) continue;
			const file = parseFile(await a.read(path)), nm = parseName(name);
			const device = file.header?.device ?? nm?.id;
			if (!device) continue;
			if (device === own.id) {
				const year = file.header?.year || nm?.year;
				if (!year) continue;
				this.ledger(year).absorb(file, taken.has(year));
				taken.add(year);
			} else if (!tmp) {
				const st = await a.stat(path);
				this.others.set(path, { path, mtime: st?.mtime ?? 0, size: st?.size ?? 0, device, name, file });
			}
		}
	}

	/** The other devices' files again, where they changed (Sync brought one in). True if anything did. */
	async refresh(): Promise<boolean> {
		const a = this.app.vault.adapter;
		let changed = false;
		try {
			if (!(await a.exists(this.dir))) return false;
			const own = this.who(), seen = new Set<string>();
			for (const path of (await a.list(this.dir)).files) {
				const name = baseName(path);
				if (!name.endsWith('.' + EXT)) continue;
				seen.add(path);
				const st = await a.stat(path), had = this.others.get(path);
				if (had && st && had.mtime === st.mtime && had.size === st.size) continue;
				const file = parseFile(await a.read(path)), nm = parseName(name), device = file.header?.device ?? nm?.id;
				if (!device || device === own.id) continue;
				this.others.set(path, { path, mtime: st?.mtime ?? 0, size: st?.size ?? 0, device, name, file });
				changed = true;
			}
			for (const p of [...this.others.keys()]) if (!seen.has(p)) { this.others.delete(p); changed = true; }
		} catch { /* read again later */ }
		return changed;
	}

	/** Everything in the record, the devices added together: as it stands in memory, with this device's own days
	    as counted now. */
	merged(): Merged {
		const sources: Source[] = [...this.others.values()].map((o) => ({ device: o.device, file: o.file, name: o.name }));
		const own = this.who();
		for (const l of this.ledgers.values()) sources.push({ device: own.id, file: l.toParsed() });
		return merge(sources);
	}

	/** Words typed on a day, added less cut, on every device: this one as counted now, the others as their files say
	    (the later of a device's copies of a day). */
	todayNet(day: string): number {
		let n = this.ledgers.get(yearOf(day))?.net(day, '') ?? 0;
		const best = new Map<string, DayLine>();
		for (const o of this.others.values()) for (const d of o.file.days) if (d.d === day) { const h = best.get(o.device); if (!h || d.u > h.u) best.set(o.device, d); }
		for (const d of best.values()) for (const c of Object.values(d.n)) n += c[0] - c[1];
		return n;
	}

	/** Reads what is on disk, then merges. */
	async readAll(): Promise<Merged> {
		try { await this.load(); } catch { /* what is in memory */ }
		await this.refresh();
		return this.merged();
	}

	// ---- writing ----

	private async ensureDir(): Promise<void> {
		const a = this.app.vault.adapter;
		let at = '';
		for (const part of this.dir.split('/')) {
			at = at ? `${at}/${part}` : part;
			if (!(await a.exists(at))) await a.mkdir(at);
		}
	}

	/** Writes what is new. True if there was nothing to write or all of it was; false if some could not be (it is
	    kept, and the next call tries again). Never throws. */
	async flush(): Promise<boolean> {
		if (this.dead || this.blocked || !this.dirty) return true;
		try { await this.load(); } catch { this.failures++; return false; }
		let all = true;
		for (const l of this.ledgers.values()) {
			if (!l.dirty || l.locked) continue;
			// (taken as written now: what is added while the write is under way is still to write)
			l.saved();
			try { await this.write(l); this.failures = 0; } catch { l.dirty = true; this.failures++; all = false; }
		}
		return all;
	}

	private async write(l: Ledger): Promise<void> {
		const a = this.app.vault.adapter, d = this.who(), name = fileName(l.year, d.label, d.id), path = `${this.dir}/${name}`, tmp = path + '.tmp';
		const text = l.serialize();
		await this.ensureDir();
		if (this.dead) return;
		await this.rename(l, name);
		if (this.dead) return;
		await a.write(tmp, text);
		// whole, or not put in place
		if ((await a.stat(tmp))?.size !== new TextEncoder().encode(text).length) throw new Error('short write');
		try { await a.rename(tmp, path); } catch {
			// Where a file can't be moved over another: the old one goes first (the new is whole beside it), and if even
			// that fails, it is written in place, and the temporary one removed.
			try { await a.remove(path); await a.rename(tmp, path); } catch { await a.write(path, text); try { await a.remove(tmp); } catch { /* left */ } }
		}
	}

	/** This device's file for the year under a name it had (the label was changed): it is moved to the new name. */
	private async rename(l: Ledger, name: string): Promise<void> {
		const a = this.app.vault.adapter, id = this.who().id;
		try {
			for (const f of (await a.list(this.dir)).files) {
				const n = baseName(f), nm = parseName(n);
				if (nm && nm.id === id && nm.year === l.year && n !== name && !(await a.exists(`${this.dir}/${name}`))) await a.rename(f, `${this.dir}/${name}`);
			}
		} catch { /* a name left as it is */ }
	}
}
