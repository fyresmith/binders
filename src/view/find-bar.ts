import { MarkdownView, Platform, Scope, TFile, setIcon, setTooltip, type EventRef } from 'obsidian';
import type BindersPlugin from '../main';
import { apply, findIn, inverse, type Edit, type FindOptions, type Hit } from '../find/search';
import { replaceEdits } from '../find/replace';
import { rangesIn } from '../find/highlight';
import { lf, parts } from '../scene-text';
import { saveOpen } from '../scenes';
import { liveEditors } from './editable-embed';
import { reviewReplace } from './find-review';

/* Find and replace across a binder: the bar. It is Obsidian's own find bar (`document-search-container` and what is
   in it, by its classes, with its keys), given more than one note to look through. What it looks through, and how a
   match is shown and gone to, is its host's to say: the binder view (the manuscript's sections; the cards and rows of
   the boards and the outliner) or a note in focus mode with the scenes before and after it showing. */

/** One thing looked through: a note's text, or text as it is drawn (which can be found in, never replaced in). */
export interface FindSource { id: string; name: string; file: TFile | null; drawn?: HTMLElement }
export interface Found { source: FindSource; text: string; hits: Hit[] }
export interface At { found: Found; hit: number }
export interface FindState { query: string; options: FindOptions; found: Found[]; at: At | null }

/** `root`: the path of the folder the notes are listed under (the review shows each note's folder from there). */
export interface Keep { of: 'binder' | 'folder' | 'note'; name: string; root: string; take(why: string): Promise<void> }

export interface FindHost {
	plugin: BindersPlugin;
	/** What next and previous step over: every match (text in sight), or every note with one (cards, rows). */
	steps(): 'matches' | 'notes';
	/** For 'notes': what a note is shown as (its own card or row, or the card of the folder it is in): a step goes to
	    the next of those. */
	stopOf?(source: FindSource): string;
	/** Everything looked through, in reading order. */
	sources(): FindSource[];
	/** Where the reader is: stepping starts from the first match at or after it. */
	here(): { id: string; offset: number } | null;
	/** Shows what was found; `go`: and brings the one the writer is on into sight. */
	show(state: FindState | null, go: boolean): void;
	/** What a replace all is kept in a snapshot of first (the binder, a folder of it, or the one note), and how it is
	    taken (it throws if it couldn't be: then nothing is replaced). Null: nothing can be replaced here. */
	snapshot(): Keep | null;
	/** Why nothing can be replaced (a binder in a newer format, a folder that can't have snapshots), or null. */
	locked(): string | null;
	/** Can one match be replaced where it stands (text in an editor)? Else the bar offers only replace all. */
	replacesOne(): boolean;
	/** Replaces one match in its editor, as a step Undo there takes back. False if it couldn't. */
	replaceOne(at: At, by: string): Promise<boolean>;
	/** The bar has closed: the keyboard goes back to where the writer was (on the match, if there is one). */
	closed(at: At | null): void;
}

interface Done { query: string; by: string; notes: { file: TFile; after: string; back: Edit[] }[]; count: number; left: string[]; kept: string[]; undone?: { back: number; left: number } }

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const n = (count: number, one: string, many = one + 's') => `${count.toLocaleString()} ${count === 1 ? one : many}`;

export class FindBar {
	readonly el: HTMLElement;
	private input: HTMLInputElement;
	private by: HTMLInputElement;
	private countEl: HTMLElement;
	private caseEl: HTMLElement;
	private replaceRow: HTMLElement;
	private oneEl: HTMLElement;
	private doneEl: HTMLElement;
	private scope: Scope;
	private scoped = false;
	private options: FindOptions = { matchCase: false };
	private found: Found[] = [];
	private at: At | null = null;
	private token = 0;
	private timer = 0;
	private texts = new Map<string, { mtime: number; text: string }>();
	private done: Done | null = null;
	private busy = false;
	private open = true;
	private watching: EventRef[] = [];
	private watchingBinders: EventRef | null = null;
	/** How long the last whole search took, in ms (for the round's measurements). */
	took = 0;

	constructor(private host: FindHost, private replacing: boolean, private onClose: () => void) {
		const { app } = host.plugin;
		const el = this.el = createDiv({ cls: 'document-search-container binders-find' });
		const row = el.createDiv({ cls: 'document-search' });
		const box = row.createDiv({ cls: 'search-input-container document-search-input' });
		this.input = box.createEl('input', { type: 'text', attr: { placeholder: 'Find...', enterkeyhint: 'search', spellcheck: 'false' } });
		this.countEl = box.createDiv({ cls: 'document-search-count' });
		const buttons = row.createDiv({ cls: 'document-search-buttons' });
		const button = (into: HTMLElement, icon: string, name: string, keys: string, press: () => void, cls = 'document-search-button'): HTMLElement => {
			const b = into.createEl('button', { cls: `clickable-icon ${cls}`, attr: { 'aria-label': name } });
			setIcon(b, icon);
			setTooltip(b, keys ? `${name}\n${keys}` : name, { placement: 'top' });
			// (a press on a button doesn't take the keyboard from the field, as in Obsidian's bar)
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', (e) => { e.preventDefault(); press(); });
			return b;
		};
		button(buttons, 'lucide-arrow-up', 'Previous', 'Shift + F3', () => this.step(-1));
		button(buttons, 'lucide-arrow-down', 'Next', 'F3', () => this.step(1));
		this.caseEl = button(buttons, 'uppercase-lowercase-a', 'Match case', '', () => { this.options = { matchCase: !this.options.matchCase }; this.caseEl.toggleClass('is-active', this.options.matchCase); this.caseEl.setAttr('aria-pressed', String(this.options.matchCase)); void this.search(); });
		this.caseEl.setAttr('aria-pressed', 'false');
		button(buttons, 'lucide-x', 'Exit search', '', () => this.close(), 'document-search-close-button');
		this.replaceRow = el.createDiv({ cls: 'document-replace' });
		this.by = this.replaceRow.createEl('input', { cls: 'document-replace-input', type: 'text', attr: { placeholder: 'Replace with...', spellcheck: 'false' } });
		const rb = this.replaceRow.createDiv({ cls: 'document-replace-buttons' });
		this.oneEl = button(rb, 'lucide-replace', 'Replace', 'Enter', () => void this.replaceOne());
		button(rb, 'lucide-replace-all', 'Replace all...', `${Platform.isMacOS ? '⌘ ⌥' : 'Ctrl + Alt +'} Enter`, () => void this.replaceAll());
		this.doneEl = el.createDiv({ cls: 'binders-find-done' });
		this.doneEl.hide();
		this.setReplacing(replacing);

		this.input.addEventListener('input', () => { this.done = null; this.drawDone(); window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { void this.search(); }, 150); });
		// the keys are Obsidian's bar's, and they are the bar's only while the keyboard is in it
		const s = this.scope = new Scope(app.scope), inBar = () => el.contains(el.ownerDocument.activeElement);
		// (Enter on a focused button presses that button, as it does in Obsidian's bar: the browser does it, so the key is left alone)
		const key = (mods: ('Mod' | 'Shift' | 'Alt')[], k: string, run: (e: KeyboardEvent) => void) => s.register(mods, k, (e): false | undefined => { if (!inBar() || e.isComposing || (k === 'Enter' && e.target instanceof HTMLButtonElement)) return undefined; e.preventDefault(); run(e); return false; });
		key([], 'Enter', () => { if (el.ownerDocument.activeElement === this.by && this.replacing && this.host.replacesOne()) void this.replaceOne(); else this.step(1); });
		key(['Shift'], 'Enter', () => this.step(-1));
		key([], 'F3', () => this.step(1));
		key(['Shift'], 'F3', () => this.step(-1));
		key(['Mod'], 'G', () => this.step(1));
		key(['Mod', 'Shift'], 'G', () => this.step(-1));
		key(['Mod', 'Alt'], 'Enter', () => { if (this.replacing) void this.replaceAll(); });
		key([], 'Escape', () => this.close());
		const tab = () => { if (!this.replacing) return; (el.ownerDocument.activeElement === this.input ? this.by : this.input).focus(); };
		key([], 'Tab', tab);
		key(['Shift'], 'Tab', tab);
		el.addEventListener('focusin', () => { if (!this.scoped) { app.keymap.pushScope(s); this.scoped = true; } });
		el.addEventListener('focusout', () => window.setTimeout(() => { if (this.scoped && !inBar()) { app.keymap.popScope(s); this.scoped = false; } }));
		// (what's looked through follows the vault: a note written from outside, or typed in, is read again)
		// (and a note made, renamed or deleted, or a binder whose order changed, is looked through again: a note that comes
		// into the binder from outside is in the count and in a Replace all)
		const again = () => this.soon(), vault = app.vault;
		this.watching = [
			vault.on('modify', (f) => { this.texts.delete(f.path); again(); }),
			vault.on('create', again),
			vault.on('rename', again),
			vault.on('delete', again),
		];
		this.watchingBinders = this.host.plugin.binders.on('changed', again);
	}

	get query(): string { return this.input.value; }
	get state(): FindState | null { return this.query ? { query: this.query, options: this.options, found: this.found, at: this.at } : null; }
	get isReplacing(): boolean { return this.replacing; }

	setReplacing(on: boolean): void {
		this.replacing = on;
		const can = on && !!this.host.snapshot() && !this.host.locked();
		this.el.toggleClass('mod-replace-mode', can);
		this.oneEl.toggle(this.host.replacesOne());
		if (on && !can && this.host.locked()) { this.doneEl.setText(this.host.locked() ?? ''); this.doneEl.show(); }
	}

	/** Puts the keyboard in the bar; given text (what was selected), looks for that. */
	focus(text?: string, replace = false): void {
		if (text && !/\n/.test(text)) this.input.value = text;
		const field = replace && this.replacing && this.query ? this.by : this.input;
		field.focus({ preventScroll: true });
		field.select();
		if (text) void this.search();
	}

	/** What is looked through has changed (another folder, another mode): the same query, there. */
	rescope(): void { this.setReplacing(this.replacing); if (this.query) void this.search(true); else this.host.show(null, false); }

	private soon(): void { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { if (this.open && this.query && !this.busy) void this.search(true); }, 300); }

	/** A note's text as it is now: as typed in an editor it is open in (saved or not), else as the vault has it. */
	private async read(src: FindSource, fresh = false): Promise<string> {
		const f = src.file, { app } = this.host.plugin;
		if (!f) return '';
		const live = liveEditors(f).find((l) => l.editor);
		if (live) return live.text;
		for (const leaf of app.workspace.getLeavesOfType('markdown')) { const v = leaf.view; if (v instanceof MarkdownView && v.file === f && v.getMode() === 'source') return v.editor.getValue(); }
		// (what replaces is read from the vault itself, never from what was kept a moment ago)
		if (fresh) return app.vault.read(f);
		const kept = this.texts.get(f.path);
		if (kept && kept.mtime === f.stat.mtime) return kept.text;
		const text = await app.vault.cachedRead(f);
		this.texts.set(f.path, { mtime: f.stat.mtime, text });
		return text;
	}

	/** Looks through everything. `keep`: the writer stays on the match they were on (the text changed under the bar),
	    and the page isn't moved. A later search gives an earlier one up. */
	async search(keep = false, from?: { id: string; offset: number }): Promise<void> {
		const mine = ++this.token, query = this.query, o = this.options, began = performance.now();
		const was = this.at ? { id: this.at.found.source.id, hit: this.at.hit } : null;
		if (!query) { this.found = []; this.at = null; this.draw(); this.host.show(null, false); return; }
		const found: Found[] = [], sources = this.host.sources();
		let slice = performance.now();
		for (const source of sources) {
			if (source.drawn) { const hits = rangesIn(source.drawn, query, o).map((_, i) => ({ from: i, to: i })); if (hits.length) found.push({ source, text: '', hits }); continue; }
			let text: string;
			try { text = await this.read(source); } catch { continue; }
			if (mine !== this.token) return;
			const hits = findIn(text, query, o);
			if (hits.length) found.push({ source, text, hits });
			// (the page stays alive under a long search: a breath every few milliseconds of it)
			if (performance.now() - slice > 12) { this.count(found, null, true); await sleep(0); if (mine !== this.token) return; slice = performance.now(); }
		}
		this.found = found;
		this.took = performance.now() - began;
		const start = from ?? (keep ? null : this.host.here());
		if (keep && was && !from) {
			const f = found.find((x) => x.source.id === was.id);
			this.at = f ? { found: f, hit: Math.min(was.hit, f.hits.length - 1) } : null;
		} else this.at = this.pick(start);
		this.draw();
		this.host.show(this.state, !keep || !!from);
	}

	/** The first match at or after a place (the first of all, past the end or with no place). */
	private pick(start: { id: string; offset: number } | null): At | null {
		const found = this.found;
		if (!found.length) return null;
		if (!start) return { found: found[0], hit: 0 };
		const order = this.host.sources().map((s) => s.id), i = order.indexOf(start.id);
		for (const f of found) {
			const j = order.indexOf(f.source.id);
			if (j < i) continue;
			if (j > i) return { found: f, hit: 0 };
			const h = f.hits.findIndex((x) => x.from >= start.offset);
			if (h >= 0) return { found: f, hit: h };
		}
		return { found: found[0], hit: 0 };
	}

	step(d: number): void {
		const found = this.found;
		if (!found.length) return;
		if (!this.at) this.at = { found: found[0], hit: 0 };
		else {
			let i = found.indexOf(this.at.found), h = this.at.hit + d;
			if (this.host.steps() === 'notes') {
				const stop = (f: Found) => this.host.stopOf?.(f.source) ?? f.source.id, was = stop(found[i]);
				// (the next card or row with a match: several notes may be behind one folder's card)
				for (let k = 0; k < found.length; k++) { i = (i + d + found.length) % found.length; if (stop(found[i]) !== was) break; }
				if (d < 0) while (i > 0 && stop(found[i - 1]) === stop(found[i])) i--;
				h = 0;
			}
			else if (h < 0) { i = (i - 1 + found.length) % found.length; h = found[i].hits.length - 1; }
			else if (h >= found[i].hits.length) { i = (i + 1) % found.length; h = 0; }
			this.at = { found: found[i], hit: h };
		}
		this.draw();
		this.host.show(this.state, true);
	}

	private count(found: Found[], at: At | null, running = false): void {
		const el = this.countEl, notes = this.host.steps() === 'notes';
		el.toggle(!!this.query);
		el.empty();
		const total = found.reduce((t, f) => t + f.hits.length, 0);
		let i = 0;
		if (at) { if (notes) i = found.indexOf(at.found) + 1; else { for (const f of found) { if (f === at.found) break; i += f.hits.length; } i += at.hit + 1; } }
		const many = this.host.sources().length > 1;
		// (cards and rows: the one the writer is on is the one selected, so only how many is said)
		if (notes) el.createSpan({ text: total ? `${total.toLocaleString()} in ${n(found.length, 'note')}` : '0' });
		else {
			el.createSpan({ text: `${i} / ${total.toLocaleString()}` });
			if (many && total) el.createSpan({ cls: 'binders-find-count-notes', text: ` in ${n(found.length, 'note')}` });
		}
		el.setAttr('aria-label', `${notes ? `Note ${i} of ${found.length}` : `Match ${i} of ${total}`}${many ? `, ${n(total, 'match', 'matches')} in ${n(found.length, 'note')}` : ''}`);
		this.input.toggleClass('mod-no-match', !!this.query && !total && !running);
	}

	private draw(): void { this.count(this.found, this.at); }

	private drawDone(): void {
		const el = this.doneEl, d = this.done;
		el.empty();
		el.toggle(!!d);
		if (!d) return;
		if (d.undone) {
			el.createSpan({ text: `Put back in ${n(d.undone.back, 'note')}.${d.undone.left ? ` ${n(d.undone.left, 'note was', 'notes were')} changed since, and left as ${d.undone.left === 1 ? 'it is' : 'they are'}.` : ''}` });
			return;
		}
		el.createSpan({ text: `${d.by ? 'Replaced' : 'Removed'} ${d.count.toLocaleString()} in ${n(d.notes.length, 'note')}.${d.left.length ? ` ${n(d.left.length, 'note was', 'notes were')} changed meanwhile, and left as ${d.left.length === 1 ? 'it is' : 'they are'}.` : ''}${d.kept.length ? ` ${n(d.kept.length, 'note was', 'notes were')} left as ${d.kept.length === 1 ? 'it is' : 'they are'}: the replacement would have turned the start of ${d.kept.length === 1 ? 'it' : 'them'} into properties.` : ''}` });
		const undo = el.createEl('button', { cls: 'binders-find-undo', text: 'Undo' });
		undo.addEventListener('mousedown', (e) => e.preventDefault());
		undo.addEventListener('click', () => void this.undo());
	}

	private async replaceOne(): Promise<void> {
		const at = this.at, by = this.by.value;
		if (!at || !this.host.replacesOne() || this.busy || this.host.locked()) return;
		// (a replacement that would open or close the note's properties is refused, as Replace all refuses it: the lines
		// the writer had would become properties)
		const h0 = at.found.hits[at.hit];
		if (!at.found.source.drawn && h0 && parts(apply(at.found.text, [{ ...h0, text: by }])).front !== parts(at.found.text).front) {
			this.doneEl.setText('Not replaced: the replacement would turn the start of the note into properties.');
			this.doneEl.show();
			return;
		}
		this.busy = true;
		try {
			const h = at.found.hits[at.hit];
			if (await this.host.replaceOne(at, by)) await this.search(false, { id: at.found.source.id, offset: h.from + by.length });
			else await this.search(true);
		} finally { this.busy = false; }
	}

	/** Replace all: shown first (how many, in which notes, each change where it falls), then a snapshot, then each note
	    in its editor if it has one, else in one write. A note that is no longer exactly what was shown is left as it
	    is, and counted. */
	async replaceAll(): Promise<void> {
		const { plugin } = this.host, keep = this.host.snapshot(), by = this.by.value, query = this.query, o = this.options;
		if (!keep || this.host.locked() || this.busy || !query) return;
		const plan = this.found.filter((f) => f.source.file && !f.source.drawn);
		if (!plan.length) return;
		const count = plan.reduce((t, f) => t + f.hits.length, 0);
		if (!await reviewReplace(plugin, { query, by, plan, keep, count })) { this.input.focus({ preventScroll: true }); return; }
		this.busy = true;
		const done: Done = { query, by, notes: [], count: 0, left: [], kept: [] };
		try {
			const files = plan.map((f) => f.source.file).filter((f): f is TFile => !!f);
			await saveOpen(plugin.app, files);
			await keep.take(`Before replacing “${query}” with “${by}”`);
		} catch (e) {
			// (no snapshot, no replace: nothing was changed)
			this.doneEl.setText(e instanceof Error ? e.message : 'Nothing was replaced.');
			this.doneEl.show();
			this.busy = false;
			return;
		}
		try {
			for (const f of plan) {
				const file = f.source.file;
				if (!file) continue;
				try {
					const now = await this.read(f.source, true);
					let hits = f.hits;
					if (now !== f.text) {
						// the same words with other line breaks (an editor keeps "\n" in a note that has "\r\n"): looked for again, and
						// used only if it finds just what was shown
						hits = lf(now) === lf(f.text) ? findIn(now, query, o) : [];
						if (hits.length !== f.hits.length || !hits.length) { done.left.push(f.source.name); continue; }
					}
					const edits: Edit[] = hits.map((h) => ({ ...h, text: by })), next = apply(now, edits);
					// (a replacement that would open or close the note's properties would change them: not done)
					if (parts(next).front !== parts(now).front) { done.kept.push(f.source.name); continue; }
					if (!await replaceEdits(plugin, file, now, edits)) { done.left.push(f.source.name); continue; }
					done.notes.push({ file, after: next, back: inverse(now, edits) });
					done.count += hits.length;
				} catch { done.left.push(f.source.name); }
			}
		} finally { this.busy = false; }
		this.texts.clear();
		await this.search(true);
		this.done = done;
		this.drawDone();
		this.input.focus({ preventScroll: true });
	}

	/** Takes a replace all back: each note that is still exactly what the replace left is given its text again; one
	    typed in since is left as it is, and counted. */
	private async undo(): Promise<void> {
		const d = this.done, { plugin } = this.host;
		if (!d || this.busy) return;
		this.busy = true;
		let back = 0, left = 0;
		try {
			await saveOpen(plugin.app, d.notes.map((x) => x.file));
			for (const x of d.notes) {
				try {
					const now = await this.read({ id: x.file.path, name: x.file.basename, file: x.file }, true);
					if (now !== x.after || !await replaceEdits(plugin, x.file, now, x.back)) left++; else back++;
				} catch { left++; }
			}
		} finally { this.busy = false; }
		d.undone = { back, left };
		this.texts.clear();
		await this.search(true);
		this.drawDone();
	}

	close(): void {
		if (!this.open) return;
		this.open = false;
		this.token++;
		window.clearTimeout(this.timer);
		const { app, binders } = this.host.plugin;
		for (const r of this.watching) app.vault.offref(r);
		if (this.watchingBinders) binders.offref(this.watchingBinders);
		if (this.scoped) { this.host.plugin.app.keymap.popScope(this.scope); this.scoped = false; }
		const at = this.at;
		this.el.detach();
		this.host.show(null, false);
		this.onClose();
		this.host.closed(at);
	}
}
