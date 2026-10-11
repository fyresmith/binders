import type { Day, History, Mark } from './model';
import type { DayLine, EventLine, Kind, ParsedFile, Sitting } from './format';

/* Reading the record: every device's files for a binder, added together into the days and events the window reads.
   Pure.

   - Each device records only what was typed on it, so the devices' days are added; but a device's day is one line
     in each copy of its file, and when Sync leaves two copies of one device's line, the later by its own `u` stands
     and the other is not added in.
   - The binder's total on a day is the one stamped last by any device. A device that had not yet received another's
     words stamps a total that is short of them; the next day's stamp is true again, and the difference between the
     totals and what was logged ("changed elsewhere") shows the one and gives back the other.
   - A scene's days follow its renames: a name is looked up through the renames made on or after the day it was
     written under, by the day each says (a device's own clock), in a chain whichever device's clock says first. */

export interface Source { device: string; file: ParsedFile; /** the file's name, when the header is missing */ name?: string }

export interface MergedDay {
	day: string;
	/** By note, under the name it has now: added, cut, brought in, taken out. */
	notes: Record<string, [number, number, number, number]>;
	added: number; cut: number;
	/** Words that came (+) or went (−) a block at a time, net. */
	block: number;
	minutes: number;
	hours: Record<number, number>;
	/** Words added on a phone or a tablet. */
	phone: number;
	sittings: Sitting[];
	/** The binder's words, its scenes and its words by status, as stamped last that day. */
	total?: number; scenes?: number; status: Record<string, number>;
	/** The words the totals changed by that nobody typed on a device with Binders (an edit elsewhere, a device without
	    it): the day's change in the total less what was logged since the stamp before. Null where there is no stamp
	    before to tell from. */
	elsewhere: number | null;
	devices: string[];
}

export interface MergedEvent extends EventLine { device: string; /** `p` under the name it has now */ path?: string }

export interface DeviceInfo { id: string; label: string; kind: Kind; first: string; last: string }

export interface Merged { days: MergedDay[]; events: MergedEvent[]; devices: DeviceInfo[] }

const MAX_CHAIN = 64;

/** Joins sittings that overlap. */
function union(list: Sitting[]): Sitting[] {
	const out: Sitting[] = [];
	for (const s of [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
		const last = out[out.length - 1];
		if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else out.push([s[0], s[1]]);
	}
	return out;
}

export function merge(sources: Source[]): Merged {
	// ---- events: each once, in the order the days say, then the times ----
	const seen = new Set<string>(), events: MergedEvent[] = [];
	for (const s of sources) {
		for (const e of s.file.events) {
			const key = JSON.stringify(e);
			if (seen.has(key)) continue;
			seen.add(key);
			events.push({ ...e, device: s.device });
		}
	}
	events.sort((a, b) => a.d.localeCompare(b.d) || a.at - b.at);

	// ---- renames ----
	const renames = events.filter((e) => (e.k === 'renamed' || e.k === 'moved') && e.from !== undefined && e.to !== undefined);
	const resolve = (path: string, day: string): string => {
		const used = new Set<number>();
		let at = path, from = day;
		for (let step = 0; step < MAX_CHAIN; step++) {
			const i = renames.findIndex((r, k) => !used.has(k) && r.d >= from && (r.from === at || (r.folder === 1 && at.startsWith(r.from + '/'))));
			if (i < 0) break;
			const r = renames[i];
			used.add(i);
			at = r.to + at.slice(r.from.length);
			from = r.d;
		}
		return at;
	};
	const cache = new Map<string, string>();
	const follow = (path: string, day: string): string => {
		const key = day + ' ' + path;
		let v = cache.get(key);
		if (v === undefined) { v = resolve(path, day); cache.set(key, v); }
		return v;
	};
	for (const e of events) if (e.p !== undefined) e.path = follow(e.p, e.d);

	// ---- the days: one line for each device and day, the later copy ----
	const lines = new Map<string, { device: string; line: DayLine }>();
	const devices = new Map<string, DeviceInfo>();
	for (const s of sources) {
		const h = s.file.header, name = s.name ? /^\d{4} (.+) [0-9a-f]{4,}\.binder-history$/.exec(s.name)?.[1] : undefined;
		const info = devices.get(s.device) ?? { id: s.device, label: h?.label || name || s.device, kind: h?.kind ?? 'desktop', first: '', last: '' };
		devices.set(s.device, info);
		for (const d of s.file.days) {
			const key = s.device + ' ' + d.d, had = lines.get(key);
			if (!had || d.u > had.line.u) lines.set(key, { device: s.device, line: d });
			if (!info.first || d.d < info.first) info.first = d.d;
			if (d.d > info.last) info.last = d.d;
		}
	}
	const byDay = new Map<string, MergedDay>(), stamped = new Map<string, number>(), sittings = new Map<string, Sitting[]>();
	for (const { device, line } of lines.values()) {
		let m = byDay.get(line.d);
		if (!m) { m = { day: line.d, notes: {}, added: 0, cut: 0, block: 0, minutes: 0, hours: {}, phone: 0, sittings: [], status: {}, elsewhere: null, devices: [] }; byDay.set(line.d, m); }
		if (!m.devices.includes(device)) m.devices.push(device);
		for (const [path, c] of Object.entries(line.n)) {
			const to = follow(path, line.d), n = (m.notes[to] ??= [0, 0, 0, 0]);
			for (let i = 0; i < 4; i++) n[i] += c[i];
			m.added += c[0]; m.cut += c[1]; m.block += c[2] - c[3];
			if (line.k !== 'desktop') m.phone += c[0];
		}
		for (const [h, w] of Object.entries(line.h)) m.hours[Number(h)] = (m.hours[Number(h)] ?? 0) + w;
		m.minutes += line.m;
		sittings.set(line.d, [...(sittings.get(line.d) ?? []), ...line.s]);
		if (line.tot && line.tot.at >= (stamped.get(line.d) ?? -1)) {
			stamped.set(line.d, line.tot.at);
			m.total = line.tot.w; m.scenes = line.tot.n; m.status = { ...line.tot.st };
		}
	}
	const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
	let prev: number | null = null, logged = 0;
	for (const d of days) {
		d.sittings = union(sittings.get(d.day) ?? []);
		logged += d.added - d.cut + d.block;
		if (d.total !== undefined) {
			if (prev !== null) d.elsewhere = d.total - prev - logged;
			prev = d.total;
			logged = 0;
		}
	}
	return { days, events, devices: [...devices.values()].sort((a, b) => a.first.localeCompare(b.first) || a.id.localeCompare(b.id)) };
}

/** A scene's status (or label) on a day: the last it was set to by then, '' if it never was. `path`: under the name it
    has now. */
export function propOn(m: Merged, key: 'status' | 'label', path: string, day: string): string {
	let value = '';
	for (const e of m.events) {
		if (e.d > day) break;
		if (e.k === key && e.path === path) value = e.to ?? '';
	}
	return value;
}
export const statusOn = (m: Merged, path: string, day: string): string => propOn(m, 'status', path, day);

/** The merged record as the window reads it. `statuses`: the draft's statuses in their order (else as first seen). */
export function toHistory(m: Merged, statuses?: string[]): History {
	const moves = new Map<string, number>(), marks: Mark[] = [], seen: string[] = [];
	for (const e of m.events) {
		if (e.k === 'order') moves.set(e.d, (moves.get(e.d) ?? 0) + 1);
		else if (e.k === 'snapshot' && e.name) marks.push({ day: e.d, kind: 'snapshot', what: e.name });
		else if (e.k === 'export') marks.push({ day: e.d, kind: 'export', what: e.name ?? '' });
		else if (e.k === 'import') marks.push({ day: e.d, kind: 'import', what: `${e.n ?? 0} ${e.n === 1 ? 'note' : 'notes'}` });
	}
	const days: Day[] = m.days.map((d) => {
		const notes: Day['notes'] = {};
		for (const [p, c] of Object.entries(d.notes)) notes[p] = [c[0], c[1], c[2] - c[3]];
		for (const s of Object.keys(d.status)) if (s && !seen.includes(s)) seen.push(s);
		return { day: d.day, notes, minutes: d.minutes, hours: d.hours, phone: d.phone, moves: moves.get(d.day) ?? 0, status: d.status, total: d.total, scenes: d.scenes, elsewhere: d.elsewhere };
	});
	return { days, estimate: [], marks, statuses: statuses ?? seen };
}
