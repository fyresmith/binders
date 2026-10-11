import { TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import type { Handler, PropsStep } from './types';
import { sameValue } from './values';

/* Properties given to items by hand, and taking them back: each property is set to what it was before (or, made
   again, to what it was given). Exact, not tolerant: a step is taken back only if every property is still as the step
   left it, read from the disk (the cache is a moment behind). Otherwise nothing is written and the writer is told which. */

/** What the handler asks of the store. */
export interface PropsHost {
	/** Sets one property of an item (a folder's in its folder note); `undefined` takes it away. */
	setProp(item: TAbstractFile, key: string, value: unknown, at?: number): Promise<void>;
	/** A property of an item as the disk has it now (a folder's from its folder note; undefined for none). */
	readProp(item: TAbstractFile, key: string): Promise<unknown>;
	/** Writes down anything typed into these notes and not saved yet, so the disk is what the writer sees. */
	settle(files: TFile[]): Promise<void>;
}

/** The name a writer knows an item by: a folder's note by its folder. */
const nameOf = (f: TAbstractFile): string => (f instanceof TFolder ? f.name : f instanceof TFile ? (f.parent && f.basename === f.parent.name ? f.parent.name : f.basename) : f.name);

export class PropsHandler implements Handler<PropsStep> {
	constructor(private app: App, private host: PropsHost) {}

	private here(step: PropsStep) { return step.changes.filter((c) => this.app.vault.getAbstractFileByPath(c.file.path) === c.file); }

	alive(step: PropsStep): boolean { return this.here(step).length > 0; }

	async check(step: PropsStep, redo: boolean): Promise<void> {
		const here = this.here(step);
		await this.host.settle(here.map((c) => c.file).filter((f): f is TFile => f instanceof TFile));
		for (const c of here) {
			const now = await this.host.readProp(c.file, c.key);
			if (!sameValue(now, redo ? c.before : c.after)) throw new Error(`The ${step.what?.[c.key] ?? `“${c.key}” property`} of “${nameOf(c.file)}” has been changed since, so it stays as it is.`);
		}
	}

	async apply(step: PropsStep, redo: boolean): Promise<void> {
		// (a property brought back goes where it stood: the ones that stood first first)
		const changes = redo ? this.here(step) : [...this.here(step)].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
		for (const c of changes) await this.host.setProp(c.file, c.key, redo ? c.after : c.before, redo ? undefined : c.at);
	}
}
