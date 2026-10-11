import type { TAbstractFile, TFile, TFolder } from 'obsidian';
import { UnsupportedBinder } from '../model';
import type { Entry, Handler, Handlers, Scope, Step } from './types';

/* The history of what was done by hand to binders, in memory: the entries, newest last, those taken back to be made
   again, and the one way of taking an entry back or making it again. It knows nothing of the vault: each kind of step
   has a handler (types.ts) that does. Per binder it keeps the last `entries`, and in all `bytes` of what entries hold,
   dropping the oldest first. */

export const LIMITS = { entries: 100, bytes: 32 * 1024 * 1024 };



export class History {
	/** What was done by hand, newest last. Undoing an entry puts its items back as they were, in the binder as it is
	    now: whatever was renamed, added or reordered since stays as it is. */
	undos: Entry[] = [];
	/** What was taken back, newest last, to make again. Emptied by the next thing done by hand. */
	redos: Entry[] = [];
	/** Set by whoever makes the handlers (they need the store the history is part of). */
	handlers!: Handlers;
	limits = { ...LIMITS };
	/** Called when the entries change (a button showing what "Undo" would take back). */
	onChange: () => void = () => {};

	/** What is being done and not yet recorded, and the undo or redo running: a new one waits for them, so that asked
	    twice in a row, or just after a field was left, each takes the one before it. */
	private pending: Promise<unknown>[] = [];
	private chain: Promise<unknown> = Promise.resolve();

	constructor(private scope: Scope) {}

	/** Notes that something is being done by hand and will be recorded when it is: `undo` waits for it. */
	track<T>(work: Promise<T>): Promise<T> {
		const done = work.then(() => {}, () => {});
		this.pending.push(done);
		void done.then(() => { this.pending = this.pending.filter((x) => x !== done); });
		return work;
	}

	/** Remembers what was done, and forgets what was taken back and not made again. */
	record(entry: Omit<Entry, 'at' | 'bytes'> & { bytes?: number }): Entry {
		const e: Entry = { ...entry, at: Date.now(), bytes: entry.bytes ?? 0 };
		this.undos.push(e);
		this.redos = [];
		this.trim();
		this.onChange();
		return e;
	}

	/** Keeps to the limits: the oldest of a binder's entries go past `entries`, the oldest of all past `bytes`. */
	trim(): void {
		const counts = new Map<TFile, number>();
		for (const e of this.undos) counts.set(e.note, (counts.get(e.note) ?? 0) + 1);
		for (let i = 0; i < this.undos.length;) {
			const n = counts.get(this.undos[i].note) ?? 0;
			if (n > this.limits.entries) { counts.set(this.undos[i].note, n - 1); this.undos.splice(i, 1); } else i++;
		}
		let total = [...this.undos, ...this.redos].reduce((n, e) => n + e.bytes, 0);
		// (the newest entry stays even when it alone is over: whoever records it decides whether it can be kept at all)
		for (let i = 0; total > this.limits.bytes && i < this.undos.length - 1;) {
			if (!this.undos[i].bytes) { i++; continue; }
			total -= this.undos[i].bytes;
			this.undos.splice(i, 1);
		}
	}

	/** Forgets everything remembered of a binder. */
	forget(note: TFile): void {
		this.undos = this.undos.filter((e) => e.note !== note);
		this.redos = this.redos.filter((e) => e.note !== note);
		this.onChange();
	}

	private handler(s: Step): Handler<Step, unknown> { return this.handlers[s.kind]; }
	private alive(e: Entry, redo: boolean): boolean { return e.steps.some((s) => this.handler(s).alive(s, redo)); }

	/** Every entry that names an item names its new self: a note made again after an undo is another object, and the
	    entries about it (its synopsis, its name) are still about it. */
	repoint(from: TAbstractFile, to: TAbstractFile): void {
		for (const e of [...this.undos, ...this.redos]) for (const s of e.steps) { const h = this.handler(s); h.repoint?.(s, from, to); }
	}

	/** What "Undo" (or "Redo") would take back in this binder, or null. */
	undoable(item: TAbstractFile | string, redo = false): string | null {
		const s = this.scope.binderOf(item), stack = redo ? this.redos : this.undos;
		// (a change whose items have all been deleted since has nothing to take back: it isn't offered)
		for (let i = stack.length - 1; i >= 0; i--) if (stack[i].note === s?.note && this.alive(stack[i], redo)) return stack[i].label;
		return null;
	}

	/** The binder where something was last done by hand (or, with `redo`, last taken back): its folder. */
	lastChanged(redo = false): TFolder | null {
		const stack = redo ? this.redos : this.undos;
		for (let i = stack.length - 1; i >= 0; i--) { const note = stack[i].note, s = this.scope.all().find((b) => b.note === note); if (s) return s.folder; }
		return null;
	}

	/** Takes back the last thing done by hand in this binder (or, with `redo`, makes it again). Nothing is changed
	    unless every step can be; then the entry stays to be undone later. Returns what was undone, or null. */
	undo(item: TAbstractFile | string, redo = false): Promise<string | null> {
		const run = this.chain.then(() => Promise.all(this.pending)).then(() => this.run(item, redo));
		this.chain = run.then(() => {}, () => {});
		return run;
	}

	private async run(item: TAbstractFile | string, redo: boolean): Promise<string | null> {
		const s = this.scope.binderOf(item), from = redo ? this.redos : this.undos, to = redo ? this.undos : this.redos;
		if (!s) return null;
		if (s.problem) throw new UnsupportedBinder(s.problem);
		for (;;) {
			let i = from.length - 1;
			while (i >= 0 && from[i].note !== s.note) i--;
			if (i < 0) return null;
			const u = from[i];
			// (steps are made again in the order they were done, and taken back in the reverse; one with nothing there is passed over)
			const steps = (redo ? [...u.steps] : [...u.steps].reverse()).filter((st) => this.handler(st).alive(st, redo));
			// (everything it was about has been deleted since: nothing to take back, so the entry before it is the one)
			if (!steps.length) { from.splice(i, 1); continue; }
			const plans: unknown[] = [];
			try { for (const st of steps) plans.push(await this.handler(st).check(st, redo)); } catch (e) {
				// It can't be taken back as things are. Said once, and it stays, to try again when what's in the way has
				// been put right; asked again with nothing changed, it's given up, and the entry before it is the one.
				if (u.failed) { from.splice(from.indexOf(u), 1); continue; }
				u.failed = true;
				throw e;
			}
			u.failed = false;
			for (let k = 0; k < steps.length; k++) await this.handler(steps[k]).apply(steps[k], redo, plans[k]);
			from.splice(from.indexOf(u), 1);
			to.push(u);
			this.onChange();
			return u.label;
		}
	}
}
