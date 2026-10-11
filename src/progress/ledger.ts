import { hourOf, recordDay } from './day';
import { serialize, type Count, type DayLine, type EventLine, type Kind, type ParsedFile, type Total } from './format';

/* One device's record of one binder for one year, in memory: the days and events as they are added, and the file's
   text when it is time to write it. Pure. A ledger made over a file of a newer format never changes and is never
   written (golden rule 6's manner: read as far as it is understood). */

export interface Device { id: string; label: string; kind: Kind }

/** A sitting goes on while there is typing within this many minutes of the last. */
export const IDLE_MINUTES = 30;

const inScope = (path: string, scope: string): boolean => scope === '' || path === scope || path.startsWith(scope + '/');

export class Ledger {
	private days = new Map<string, DayLine>();
	private events: EventLine[] = [];
	private other: string[] = [];
	/** The last minute typing was counted in, for each day: a minute is counted once. */
	private lastMinute = new Map<string, number>();
	/** Not to be written: a newer format wrote the file. */
	readonly locked: boolean;
	/** Something is new since the file was read or written. */
	dirty = false;

	constructor(readonly device: Device, readonly year: number, parsed?: ParsedFile) {
		this.locked = !!parsed?.newer;
		if (!parsed) return;
		// (one line a day: should a hand-edited file have two for a day, the later is the one)
		for (const d of parsed.days) { const had = this.days.get(d.d); if (!had || d.u >= had.u) this.days.set(d.d, d); }
		this.events = parsed.events.slice();
		this.other = parsed.other.slice();
	}

	private line(day: string, at: number): DayLine {
		let d = this.days.get(day);
		if (!d) { d = { t: 'day', d: day, u: at, k: this.device.kind, n: {}, h: {}, s: [], m: 0 }; this.days.set(day, d); }
		d.u = Math.max(d.u, at);
		this.dirty = true;
		return d;
	}

	private count(d: DayLine, note: string): Count { return (d.n[note] ??= [0, 0, 0, 0]); }

	/** Words typed in a note: `added` and `cut`, at `at` (ms). Typing is also the hours, the minutes and the sittings. */
	typed(at: number, note: string, added: number, cut: number): void {
		if (this.locked || (!added && !cut)) return;
		const day = recordDay(at), d = this.line(day, at), c = this.count(d, note);
		c[0] += added;
		c[1] += cut;
		if (added) { const hour = String(hourOf(at)); d.h[hour] = (d.h[hour] ?? 0) + added; }
		// (a day read from a file has no minute remembered: its last sitting's end stands for it)
		const minute = Math.floor(at / 60000), prev = this.lastMinute.get(day) ?? d.s[d.s.length - 1]?.[1];
		if (prev !== minute) d.m++;
		this.lastMinute.set(day, minute);
		const s = d.s[d.s.length - 1];
		if (s && minute - s[1] <= IDLE_MINUTES && minute >= s[0]) s[1] = Math.max(s[1], minute);
		else d.s.push([minute, minute]);
	}

	/** Words that came or went a block at a time in a note (+ in, − out): not writing, and no sitting. */
	block(at: number, note: string, delta: number): void {
		if (this.locked || !delta) return;
		const c = this.count(this.line(recordDay(at), at), note);
		if (delta > 0) c[2] += delta; else c[3] -= delta;
	}

	/** The binder's total as of `at`, for the day it falls on (the last stamp of the day is the one that stays). */
	stamp(at: number, t: Omit<Total, 'at'>): void {
		if (this.locked) return;
		this.line(recordDay(at), at).tot = { at, w: t.w, n: t.n, st: t.st };
	}

	/** Something done to the binder. */
	event(e: Omit<EventLine, 't' | 'd'>): void {
		if (this.locked) return;
		this.events.push({ t: 'ev', at: e.at, d: recordDay(e.at), ...e });
		this.dirty = true;
	}

	/** Words added less words cut by typing on a day, in the notes under `scope` ('' is the binder). */
	net(day: string, scope: string): number {
		let n = 0;
		for (const [path, c] of Object.entries(this.days.get(day)?.n ?? {})) if (inScope(path, scope)) n += c[0] - c[1];
		return n;
	}

	/** The day's line, if it has one. */
	get(day: string): DayLine | undefined { return this.days.get(day); }

	/** All of it, as the lines of the file. */
	lines(): { days: DayLine[]; events: EventLine[] } {
		return { days: [...this.days.values()].sort((a, b) => a.d.localeCompare(b.d)), events: this.events };
	}

	serialize(): string {
		const { days, events } = this.lines();
		return serialize({ device: this.device.id, label: this.device.label, kind: this.device.kind, year: this.year }, days, events, this.other);
	}

	/** Written: nothing is new now. */
	saved(): void { this.dirty = false; }
}
