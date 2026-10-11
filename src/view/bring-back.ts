import { ButtonComponent, Modal, Setting, parseYaml, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { changes, planBack, type Changes, type Entry, type Plan, type Row, type Scope, type Since } from '../binder-snapshot-text';
import { backOptions, bringBackFolder, forgetInterrupted, interrupted, interruptedIn, readFolderSnapshot, stateNow, stateOutside, type FolderSnapshot, type Interrupted, type State } from '../binder-snapshots';
import { updatesLinks } from './internals';
import { buttonRow, cancelButton } from './modals';
import { say, whenIn } from './snapshots';
import { count, commitFields, nameOf, quoted, tell } from './binder-snapshot-util';

/* The screens that bring a snapshot of a folder or binder back: the one that says what will change before it does, and
   the one that offers to finish a bringing back that was cut short. They ask `src/binder-snapshots.ts` to do it. */

// ---- bringing a whole one back: what will change, said before it does ----

const SCOPES: Record<Scope, string> = { all: 'Everything', both: 'The text and the order', text: 'The text of the notes', order: 'The order' };
const isScope = (v: string): v is Scope => Object.prototype.hasOwnProperty.call(SCOPES, v);
const SINCE: Record<Since, string> = { stay: 'Leave it where it is', gather: 'Move it to one folder' };

/** "Bring back..." a snapshot of a folder or of the binder: what comes back (everything, the notes' text, the order,
    or those two), what that will change, and what is different that it leaves alone, all counted before anything is
    done. Its button does what the screen says and nothing else (`bringBackFolder`). `preset`: what it opens on (a
    bringing back that was interrupted, taken up again). */
export class BringBackModal extends Modal {
	private what: Scope = 'all';
	private since: Since = 'stay';
	private plan: Plan;
	private readonly c: Changes;
	private introEl: HTMLElement;
	private planEl: HTMLElement;
	private sinceSetting: Setting;
	private go: ButtonComponent;
	private busy = false;

	/** `outside`: the notes of the binder that are not in the folder, as they are (where a note gone from the folder is). */
	constructor(private plugin: BindersPlugin, private folder: TFolder, private s: FolderSnapshot, private then: State, private now: State, private outside: Entry[], private done: () => void, preset?: { scope?: Scope; since?: Since }) {
		super(plugin.app);
		if (preset?.scope) this.what = preset.scope;
		if (preset?.since) this.since = preset.since;
		this.c = changes(then.entries, now.entries, { yaml: parseYaml, outside });
		this.plan = this.work();
	}

	private work(): Plan { return planBack(this.c, this.then.entries, this.now.entries, this.what, backOptions(this.plugin, this.s, this.folder, this.since)); }

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(`Bring back ${quoted(this.s)}`);
		this.modalEl.addClass('binders-folder-snapshots-back');
		this.introEl = contentEl.createEl('p');
		new Setting(contentEl).setName('Bring back').addDropdown((d) => d.addOptions(SCOPES).setValue(this.what).onChange((v) => { if (isScope(v)) { this.what = v; this.draw(); } }));
		this.planEl = contentEl.createDiv({ cls: 'binders-folder-snapshots-plan' });
		// (only there when everything comes back and something is new since: see `draw`)
		this.sinceSetting = new Setting(contentEl).setName('What is new since').addDropdown((d) => d.addOptions(SINCE).setValue(this.since).onChange((v) => { this.since = v === 'gather' ? 'gather' : 'stay'; this.draw(); }));
		this.sinceSetting.settingEl.addClass('binders-folder-snapshots-since');
		const row = buttonRow(this);
		this.go = new ButtonComponent(row).setButtonText('Bring back').setCta().onClick(() => void this.run());
		cancelButton(row, this);
		this.draw();
	}

	onClose(): void { this.contentEl.empty(); }

	private draw(): void {
		const p = this.plan = this.work(), el = this.planEl, s = this.s, L = p.left, A = p.all;
		const what = this.what === 'both' ? 'the text and the order' : this.what === 'text' ? 'the text' : 'the order', from = s.title ? `the snapshot from ${whenIn(s.taken)}` : 'this snapshot';
		this.introEl.setText(this.what === 'all'
			? `“${this.folder.name}” goes back to ${from}: its notes as they were, with their properties, what is gone made again, and what was renamed or moved put back. Nothing is deleted. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back.`
			: `“${this.folder.name}” gets back ${what} it had in ${from}. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back.`);
		el.empty();
		// (an item is called what it is called now: that is the one the writer will look for)
		const some = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${(list.length - 3).toLocaleString()} more` : list.join(', '));
		const names = (list: Row[]) => some(list.map((r) => `“${r.renamed ?? r.name}”`));
		const line = (ul: HTMLElement, text: string, detail = '') => { const li = ul.createEl('li'); li.createSpan({ text }); if (detail) li.createSpan({ cls: 'u-muted', text: ' ' + detail }); };
		const it = (list: unknown[], one: string, many: string) => (list.length === 1 ? one : many);
		const will = el.createEl('ul', { cls: 'binders-folder-snapshots-plan-will' });
		if (p.rewritten.length && this.what !== 'order') {
			const words = [p.back ? `${count(p.back, 'word comes', 'words come')} back` : '', p.away ? `${p.away.toLocaleString()} written since ${p.away === 1 ? 'goes' : 'go'}` : ''].filter((x) => x).join(', ');
			line(will, `${count(p.rewritten.length, 'note gets', 'notes get')} the text ${it(p.rewritten, 'it', 'they')} had:`, `${names(p.rewritten)}.${words ? ` ${words.charAt(0).toUpperCase()}${words.slice(1)} (kept in the snapshot taken first).` : ''}`);
		}
		if (A) {
			if (A.made.length) line(will, `${count(A.made.length, 'item that is gone is', 'items that are gone are')} made again:`, `${names(A.made)}.`);
			if (A.moved.length) line(will, `${count(A.moved.length, 'item goes', 'items go')} back to the folder ${it(A.moved, 'it was', 'they were')} in:`, `${names(A.moved)}.`);
		}
		if (p.orders.length) line(will, `${count(p.moved.length, 'item goes', 'items go')} back to where ${it(p.moved, 'it was', 'they were')} in the order:`, `${names(p.moved)}.`);
		if (A) {
			if (A.renamed.length) line(will, `${count(A.renamed.length, 'item gets', 'items get')} ${it(A.renamed, 'its', 'their')} old ${it(A.renamed, 'name', 'names')} back:`, `${some(A.renamed.map((r) => `“${r.renamed ?? ''}” becomes “${r.name}”`))}.`);
			if (A.props.length) { const all = [...new Set(A.props.flatMap((r) => r.props))]; line(will, `${count(A.props.length, 'item gets', 'items get')} the properties ${it(A.props, 'it', 'they')} had:`, `${all.slice(0, 6).join(', ')}${all.length > 6 ? ` and ${all.length - 6} more` : ''}.`); }
			if (A.gather) line(will, `${count(A.gathered.length, 'item that is new since goes', 'items that are new since go')} into ${A.gather.make ? 'a new folder' : 'the folder'}, “${A.gather.folder.replace(/\/$/, '')}”:`, `${names(A.gathered)}. Nothing is deleted.`);
		}
		if (p.nothing) line(will, this.what === 'all' ? 'Nothing: everything in this snapshot is there as it was.' : this.what === 'both' ? 'Nothing: the notes that are there have the text they had, in the order they had.' : this.what === 'text' ? 'Nothing: the notes that are there have the text they had.' : 'Nothing: the items that are there are in the order they had.');
		// what is different and is not brought back, said plainly
		const left = createEl('ul', { cls: 'binders-folder-snapshots-plan-left' });
		if (L.text.length) line(left, `${count(L.text.length, 'note keeps', 'notes keep')} the text ${it(L.text, 'it has', 'they have')} now:`, `${names(L.text)}.`);
		if (L.order.length) line(left, `${count(L.order.length, 'item stays', 'items stay')} where ${it(L.order, 'it is', 'they are')} in the order:`, `${names(L.order)}.`);
		if (L.gone.length) line(left, `${count(L.gone.length, 'item that is gone isn’t', 'items that are gone aren’t')} made again:`, `${names(L.gone)}.${L.gone.some((r) => r.kind === 'note') ? ' A note can be brought back by itself: open it in the snapshot.' : ''}`);
		if (L.elsewhere.length) line(left, `${count(L.elsewhere.length, 'item stays', 'items stay')} in the folder ${it(L.elsewhere, 'it is', 'they are')} in now:`, `${names(L.elsewhere)}.`);
		if (L.renamed.length) line(left, `${count(L.renamed.length, 'item keeps', 'items keep')} the name ${it(L.renamed, 'it has', 'they have')} now:`, L.renamed.slice(0, 3).map((r) => `“${r.renamed ?? ''}” (it was “${r.name}”)`).join(', ') + (L.renamed.length > 3 ? ` and ${(L.renamed.length - 3).toLocaleString()} more.` : '.'));
		if (L.props.length) { const all = [...new Set(L.props.flatMap((r) => r.props))]; line(left, `${count(L.props.length, 'item keeps', 'items keep')} the properties ${it(L.props, 'it has', 'they have')} now:`, `${all.slice(0, 6).join(', ')}${all.length > 6 ? ` and ${all.length - 6} more` : ''}.`); }
		// (gone from this folder and in the rest of the binder: where it is, not made again; said for every choice)
		const away = A ? A.away : L.away;
		if (away.length) {
			const where = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? 'the top of the binder' : `“${p.slice(0, i)}”`; };
			line(left, `${count(away.length, 'item that was moved out of this folder stays where it is now', 'items that were moved out of this folder stay where they are now')}:`, `${some(away.map((r) => `“${nameOf(r.away ?? '')}” is in ${where(r.away ?? '')}${r.awayChanged ? ', and its text is different now' : ''}`))}.`);
		}
		if (L.fresh.length) line(left, `${count(L.fresh.length, 'item that is new since stays', 'items that are new since stay')} where ${it(L.fresh, 'it is', 'they are')}:`, `${names(L.fresh)}. Nothing is deleted.`);
		if (A) {
			if (A.stays.length) line(left, `${count(A.stays.length, 'item that is new since stays', 'items that are new since stay')} where ${it(A.stays, 'it is', 'they are')}:`, `${names(A.stays)}. Nothing is deleted.`);
			if (A.named.length) line(left, `${count(A.named.length, 'item can’t have the name it had', 'items can’t have the names they had')}, which ${it(A.named, 'an item', 'items')} new since ${it(A.named, 'has', 'have')} now:`, `${some(A.named.map((n) => (n.row.gone ? `“${n.row.name}” comes back as “${n.as}”` : `“${n.row.name}” will be “${n.as}”`)))}.`);
			if (A.ownStay.length) line(left, `${count(A.ownStay.length, 'folder keeps', 'folders keep')} the note made for ${it(A.ownStay, 'it', 'them')} since:`, `${names(A.ownStay)}.`);
			if (A.cannot.length) line(left, `${count(A.cannot.length, 'file that is gone can’t', 'files that are gone can’t')} be made again:`, `${names(A.cannot)}. A snapshot keeps notes; other files are only listed in it.`);
			if (A.places.some((x) => x.from != null) && !updatesLinks(this.app)) line(left, 'Links to what is renamed or moved stay as they are written:', '“Automatically update internal links” is off in Obsidian’s settings.');
		}
		if (left.childElementCount) {
			el.createEl('p', { cls: 'binders-folder-snapshots-plan-head', text: 'Left as it is now:' });
			el.appendChild(left);
		}
		// what is new since: a choice only when everything comes back, something is, and there are folders to make
		const choice = !!A && (!!A.gather || A.stays.some((r) => r.kind !== 'file')) && this.plugin.binders.binderOf(this.folder)?.kind !== 'longform';
		this.sinceSetting.settingEl.toggle(choice);
		this.sinceSetting.setDesc(this.since === 'gather' ? 'Goes into one folder at the end. Nothing is deleted.' : 'Stays where it is, after the item it follows now.');
		this.go.setDisabled(p.nothing || p.unsafe || this.busy);
	}

	private async run(): Promise<void> {
		const { plugin, s, folder } = this, plan = this.plan;
		if (this.busy || plan.nothing || plan.unsafe) return;
		this.busy = true;
		this.go.setDisabled(true);
		// (said as it goes when it is long: each note is a write, or an editor's change and its save)
		const going = plan.texts.length + (plan.all ? plan.all.places.length + plan.all.files.length : 0) > 20 ? say(`Bringing back ${quoted(s)}…`, 0) : null;
		try {
			await commitFields(plugin);
			const r = await bringBackFolder(plugin, s, folder, plan, (done, of) => { if (done % 10 === 0) going?.setMessage(`Bringing back ${quoted(s)}: ${done.toLocaleString()} of ${plan.all ? count(of, 'step') : count(of, 'note')}…`); });
			going?.hide();
			this.close();
			const did = plan.all
				? [r.again ? `${count(r.again, 'item')} made again` : '', r.placed ? `${count(r.placed, 'item')} put back where ${r.placed === 1 ? 'it was' : 'they were'}` : '', r.files ? `${count(r.files, 'note')} as ${r.files === 1 ? 'it was' : 'they were'}` : '', r.ordered && !r.orderLeft ? 'the order' : '', r.gathered ? `${count(r.gathered, 'item')} that ${r.gathered === 1 ? 'is' : 'are'} new since moved into “${r.into}”` : ''].filter((x) => x)
				: [r.texts ? `the text of ${count(r.texts, 'note')}` : '', r.moved ? `the place of ${count(r.moved, 'item')} in the order` : ''].filter((x) => x);
			let said = !did.length ? `Nothing was brought back from ${quoted(s)}.` : plan.all ? `Brought back ${quoted(s)}: ${did.join(', ')}.` : `Brought back ${did.join(' and ')} from ${quoted(s)}.`;
			if (r.left.length) said += ` ${count(r.left.length, plan.all ? 'item was' : 'note was', plan.all ? 'items were' : 'notes were')} left as ${r.left.length === 1 ? 'it is' : 'they are'}: ${r.left.slice(0, 3).map((l) => `“${l.name}” (${l.why})`).join(', ')}${r.left.length > 3 ? ` and ${(r.left.length - 3).toLocaleString()} more` : ''}.`;
			if (r.orderLeft) said += ' The order was left as it is: the items changed meanwhile.';
			const before = r.before.title ? `“${r.before.title}”` : `from ${whenIn(r.before.taken)}`;
			if (did.length) said += plan.all ? ` Nothing was deleted. “${folder.name}” as it was just before is kept as the snapshot ${before}: bring that one back to take this back (“Undo last move” doesn’t).` : ` “${folder.name}” as it was just before is kept as the snapshot ${before}.`;
			say(said, plan.all ? 15000 : 10000);
			this.done();
		} catch (e) {
			going?.hide();
			this.busy = false;
			tell(e);
			// (stopped part of the way: its plan is still written down, and says what can be done about it)
			const cut = plan.all ? await interruptedIn(plugin, folder).catch((): null => null) : null;
			if (cut) { this.close(); this.done(); new InterruptedModal(plugin, cut, this.done).open(); }
			else if (this.go.buttonEl.isConnected) this.draw();
		}
	}
}

/** A bringing back of everything that was cut short (Obsidian closed, a file couldn't be moved): says so, and offers
    to finish it or to put things back as they were. Either one is an ordinary bringing back, of the same snapshot or
    of the one taken first: it opens the screen that says what it will change. Closing this leaves the question for
    the next time. */
export class InterruptedModal extends Modal {
	constructor(private plugin: BindersPlugin, private cut: Interrupted, private done?: () => void) { super(plugin.app); }

	onOpen(): void {
		const { contentEl, cut } = this, j = cut.journal, name = cut.folder?.name ?? cut.binder.folder.name;
		this.modalEl.addClass('binders-folder-snapshots-interrupted');
		if (!j) {
			// (a plan this version can't read is a newer Binders': it is left as it is, and nothing is brought back over it)
			this.setTitle('A snapshot is being brought back');
			contentEl.createEl('p', { text: `A newer version of Binders has brought a snapshot back in “${cut.binder.folder.name}”, and the plan it wrote down is still there. Update Binders to bring a snapshot back here.` });
			cancelButton(buttonRow(this), this).setButtonText('Close');
			return;
		}
		this.setTitle(j.title ? `Bringing back “${j.title}” was interrupted` : 'Bringing back a snapshot was interrupted');
		contentEl.createEl('p', { text: `“${name}” was being put back as it stood in a snapshot when that stopped. Some of it may be done, and some not. Nothing was deleted${cut.before ? `, and “${name}” as it was just before is kept as the snapshot ${quoted(cut.before)}` : ''}.` });
		const can = !!cut.folder && (!!cut.snapshot || !!cut.before);
		contentEl.createEl('p', { cls: 'u-muted', text: can ? 'Finishing it, or putting things back, shows what will change first.' : 'The snapshots it was working from aren’t there any more, so it can’t be finished here. Look through the notes, and bring back a snapshot if something is missing.' });
		const row = buttonRow(this);
		if (cut.folder && cut.snapshot) new ButtonComponent(row).setButtonText('Finish').setCta().onClick(() => void this.take(cut.snapshot, j?.since ?? 'stay', 'It was finished already: everything in the snapshot is there as it was.'));
		if (cut.folder && cut.before) new ButtonComponent(row).setButtonText('Put it back as it was').onClick(() => void this.take(cut.before, 'stay', 'Nothing had been changed: everything is as it was before.'));
		new ButtonComponent(row).setButtonText('Leave it as it is').onClick(() => void this.leave());
	}

	onClose(): void { this.contentEl.empty(); }

	/** Takes it up again: the same screen as any bringing back, on the folder as it is now. */
	private async take(s: FolderSnapshot | null, since: Since, nothing: string): Promise<void> {
		const { plugin, cut } = this, folder = cut.folder;
		if (!s || !folder) return;
		try {
			await commitFields(plugin);
			const now = await stateNow(plugin, folder), then = await readFolderSnapshot(plugin, s, folder), outside = await stateOutside(plugin, folder);
			if (then.damaged.length) throw new Error('This snapshot’s file isn’t as it was written, so nothing is brought back from it.');
			const plan = planBack(changes(then.entries, now.entries, { words: false, yaml: parseYaml, outside }), then.entries, now.entries, 'all', backOptions(plugin, s, folder, since));
			this.close();
			if (plan.nothing && !plan.unsafe) { await forgetInterrupted(plugin, cut); say(nothing, 8000); this.done?.(); return; }
			new BringBackModal(plugin, folder, s, then, now, outside, () => this.done?.(), { scope: 'all', since }).open();
		} catch (e) { tell(e); }
	}

	private async leave(): Promise<void> {
		try { await forgetInterrupted(this.plugin, this.cut); this.close(); this.done?.(); } catch (e) { tell(e); }
	}
}

/** Says of every bringing back that was cut short that it was: asked when Binders loads. */
export async function showInterrupted(plugin: BindersPlugin): Promise<void> {
	for (const cut of await interrupted(plugin)) new InterruptedModal(plugin, cut).open();
}

