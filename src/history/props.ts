import type { App, TAbstractFile } from 'obsidian';
import type { Handler, PropsStep } from './types';

/* Properties given to items by hand (a card dragged to another label's line), and taking them back: each is set to what
   it was before, or, made again, to what it was given. */

/** What the handler asks of the store. */
export interface PropsHost {
	/** Sets one property of an item (a folder's in its folder note); `undefined` takes it away. */
	setProp(item: TAbstractFile, key: string, value: unknown): Promise<void>;
}

export class PropsHandler implements Handler<PropsStep> {
	constructor(private app: App, private host: PropsHost) {}

	alive(step: PropsStep): boolean { return step.changes.some((c) => this.app.vault.getAbstractFileByPath(c.file.path) === c.file); }

	async check(): Promise<void> {}

	async apply(step: PropsStep, redo: boolean): Promise<void> {
		for (const c of step.changes) if (this.app.vault.getAbstractFileByPath(c.file.path) === c.file) await this.host.setProp(c.file, c.key, redo ? c.after : c.before);
	}
}
