import { TFile, type App, type TAbstractFile } from 'obsidian';
import type { RemoveHandler } from './remove';
import { Declined, type Handler, type MergeStep } from './types';

/* A merge made by hand, and taking it back. The first note goes back to its whole file as it was only if it is still
   exactly the merged text (what is typed and not saved is written first, and counts); the merged-away notes are made
   again and read back before anything is taken out of the first; a note whose links the merge rewrote is put back only if
   it still has what the merge wrote. If the first note has changed, nothing is taken out of it: the writer is offered the
   merged-away notes alongside, so the text is in two places and never less. */

/** What the handler asks of the store and the views. */
export interface MergeHost {
	settle(files: TFile[]): Promise<void>;
	/** Asks the writer (true: yes). */
	offer(title: string, text: string, cta: string): Promise<boolean>;
	say(text: string): void;
	repoint(from: TAbstractFile, to: TAbstractFile): void;
}

const same = (a: ArrayBuffer, b: ArrayBuffer): boolean => {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a), y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
};

export class MergeHandler implements Handler<MergeStep, { changed: boolean }> {
	constructor(private app: App, private host: MergeHost, private remove: RemoveHandler) {}

	private firstHere(s: MergeStep): boolean { return this.app.vault.getAbstractFileByPath(s.first.path) === s.first; }

	alive(step: MergeStep, redo?: boolean): boolean {
		return this.firstHere(step) && (redo ? !!step.restored && !step.partial : !step.restored);
	}

	private bytes(f: TFile): Promise<ArrayBuffer> { return this.app.vault.adapter.readBinary(f.path); }

	async check(step: MergeStep, redo: boolean): Promise<{ changed: boolean }> {
		const first = step.first, name = first.basename;
		await this.host.settle([first, ...step.gone.map((k) => k.file).filter((f): f is TFile => f instanceof TFile)]);
		if (redo) {
			if (!same(await this.bytes(first), step.before)) throw new Error(`“${name}” has been changed since the merge was undone, so the notes are not merged again.`);
			for (const k of step.gone) {
				if (this.app.vault.getAbstractFileByPath(k.file.path) !== k.file || !(k.file instanceof TFile) || !same(await this.bytes(k.file), k.files[0].bytes)) throw new Error(`“${k.name.replace(/\.md$/, '')}” has been changed since the merge was undone, so the notes are not merged again.`);
			}
			return { changed: false };
		}
		// (every merged-away note must have its place to come back to)
		for (const k of step.gone) await this.remove.checkKept(k);
		return { changed: !same(await this.bytes(first), step.merged) };
	}

	async apply(step: MergeStep, redo: boolean, plan: { changed: boolean }): Promise<void> {
		const { vault } = this.app, first = step.first, name = first.basename;
		if (redo) {
			// (asked again of the disk: what was checked is what is there)
			if (!same(await this.bytes(first), step.before)) throw new Error(`“${name}” has been changed since the merge was undone, so the notes are not merged again.`);
			await vault.modifyBinary(first, step.merged);
			for (const k of step.gone) if (vault.getAbstractFileByPath(k.file.path) === k.file) await this.app.fileManager.trashFile(k.file);
			for (const l of step.links) if (vault.getAbstractFileByPath(l.file.path) === l.file) await vault.process(l.file, (t) => (t === l.before ? l.after : t));
			step.restored = false;
			return;
		}
		const count = step.gone.length;
		if (plan.changed) {
			const yes = await this.host.offer('Bring back the merged notes', `“${name}” has been changed since the merge, so its text stays. Bring back the ${count === 1 ? 'note' : `${count} notes`} that ${count === 1 ? 'was' : 'were'} merged into it? Their text will be in “${name}” as well.`, 'Bring back');
			if (!yes) throw new Declined();
			for (const k of step.gone) await this.remove.bringBack(k);
			step.restored = true;
			step.partial = true;
			return;
		}
		// the notes first, read back: only then is anything taken out of the first note
		const made: TFile[] = [];
		for (const k of step.gone) {
			const f = await this.remove.bringBack(k);
			if (!(f instanceof TFile) || !same(await this.bytes(f), k.files[0].bytes)) throw new Error(`“${k.name.replace(/\.md$/, '')}” couldn’t be read back, so “${name}” keeps the merged text.`);
			made.push(f);
		}
		if (!same(await this.bytes(first), step.merged)) throw new Error(`“${name}” changed as the merge was undone, so it keeps its text. The merged notes are back as well.`);
		await vault.modifyBinary(first, step.before);
		let left = 0;
		for (const l of step.links) {
			if (vault.getAbstractFileByPath(l.file.path) !== l.file) continue;
			let done = false;
			await vault.process(l.file, (t) => { if (t !== l.after) return t; done = true; return l.before; });
			if (!done) left++;
		}
		if (left) this.host.say(`${left === 1 ? 'A note' : `${left} notes`} that linked to the merged ${count === 1 ? 'note' : 'notes'} ${left === 1 ? 'has' : 'have'} changed since, so ${left === 1 ? 'its' : 'their'} links stay as they are.`);
		step.restored = true;
	}

	repoint(step: MergeStep, from: TAbstractFile, to: TAbstractFile): void {
		if (step.first === from && to instanceof TFile) step.first = to;
		for (const l of step.links) if (l.file === from && to instanceof TFile) l.file = to;
		this.remove.repoint({ kind: 'remove', trees: step.gone }, from, to);
	}
}
