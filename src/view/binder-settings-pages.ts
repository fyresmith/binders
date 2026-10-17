import { FuzzySuggestModal, Notice, Setting, TFile } from 'obsidian';
import { recordDay } from '../progress/day';
import { DAYS_PROP, DEADLINE_PROP, planProblem, readDeadline, readWritingDays, writeWritingDays } from '../progress/plan';
import { PROP as REVISION_PROP } from '../revision/store';
import { noteTemplates, ownTemplate } from '../templates';
import type { PageHost } from './binder-lists-page';
import { parseTarget, whyNotTarget } from './outliner-data';
import { drawPlanFields, type PlanDraft } from './plan-form';
import { readProps, writeKeys } from './props';
import { setTemplate } from './template-items';
import { wordsIn } from './words';
import { parts } from '../scene-text';

/* The Goal and New notes pages of Binder settings (view/binder-settings.ts). Each change is kept as it is made, and is
   one step for "Undo" to take back. */

/** Goal: the target, the deadline and the writing days of the binder, as the Progress window's plan has them. */
export function drawGoal(host: PageHost): { refresh: () => void } {
	const { plugin, binder, el } = host, s = plugin.settings, locked = !!host.locked;
	const name = binder.folder.name;
	const read = (): PlanDraft => {
		const fm = (plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter ?? {}) as Record<string, unknown>, target = readProps(plugin, binder.note).target;
		return { target: target ? String(target) : '', deadline: readDeadline(fm[DEADLINE_PROP]) ?? '', days: readWritingDays(fm[DAYS_PROP]) };
	};
	let d = read();
	const draw = () => {
		el.empty();
		d = read();
		el.createEl('p', { cls: 'binders-book-details-about', text: `What “${name}” is to come to, and by when. The Progress window paces the writing by it.` });
		const form = el.createDiv({ cls: 'binders-bset-goal' });
		const problem = el.createDiv({ cls: 'binders-pot-form-problem', attr: { role: 'status', 'aria-live': 'polite' } });
		const write = async (patch: Record<string, unknown>, label: string) => {
			try { await writeKeys(plugin, [{ file: binder.note, patch }], `${label} of “${name}”`); host.refreshSide(); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
		};
		// the words the book has now, as the Progress window counts them
		const total = async (): Promise<number> => {
			let n = 0;
			for (const f of plugin.binders.scenes(binder.folder)) n += wordsIn(plugin, parts(await plugin.app.vault.cachedRead(f)).body);
			return n;
		};
		const changed = async (field: 'target' | 'deadline' | 'days') => {
			const n = parseTarget(d.target) ?? -1, words = n > 0 || d.deadline ? await total() : 0;
			problem.setText('');
			if (n < 0) { problem.setText(whyNotTarget(d.target) ?? ''); return; }
			if (field === 'target') {
				if (n > 0 && n <= words) { problem.setText(`The book has ${Math.round(words).toLocaleString('en-US')} words already. Choose a target above that.`); return; }
				if (d.deadline && n === 0) { problem.setText('A deadline needs a target. Remove the deadline first.'); return; }
				if (d.deadline) { const why = planProblem({ target: n, deadline: d.deadline, days: d.days, total: words }, recordDay(Date.now())); if (why) { problem.setText(why); return; } }
				void write({ [s.targetProp]: n || undefined }, n ? 'Set the target' : 'Remove the target');
				return;
			}
			if (field === 'deadline') {
				if (!d.deadline) { void write({ [DEADLINE_PROP]: undefined, [DAYS_PROP]: undefined }, 'Remove the deadline'); return; }
				const why = planProblem({ target: n, deadline: d.deadline, days: d.days, total: words }, recordDay(Date.now()));
				if (why) { problem.setText(why); return; }
				void write({ [DEADLINE_PROP]: d.deadline, [DAYS_PROP]: writeWritingDays(d.days) }, 'Set the deadline');
				return;
			}
			if (!d.days.length) { problem.setText('Choose at least one day to write on.'); return; }
			void write({ [DAYS_PROP]: writeWritingDays(d.days) }, 'Change the writing days');
		};
		drawPlanFields(form, d, { about: 'The words the book is to have.', key: 'goal', locked, changed: (f) => { void changed(f); } });
		if (d.deadline && !locked) new Setting(el).addButton((b) => {
			b.setButtonText('Remove the deadline').onClick(() => { d.deadline = ''; void write({ [DEADLINE_PROP]: undefined, [DAYS_PROP]: undefined }, 'Remove the deadline').then(draw); });
			b.buttonEl.dataset.bindersKey = 'goal-remove';
		});
	};
	draw();
	return { refresh: () => { const active = el.doc.activeElement; if (!(active && el.contains(active) && active.matches('input'))) draw(); } };
}

/** A note of the vault, chosen as the revision note. */
class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(private host: PageHost, private pick: (f: TFile) => void) {
		super(host.plugin.app);
		this.setPlaceholder('Choose the revision note');
	}
	getItems(): TFile[] {
		const { binders } = this.host.plugin;
		return this.app.vault.getMarkdownFiles().filter((f) => f !== this.host.binder.note && !binders.isHiddenNote(f) && !binders.inSnapshots(f.path)).sort((a, b) => b.stat.mtime - a.stat.mtime);
	}
	getItemText(f: TFile): string { return f.path; }
	onChooseItem(f: TFile): void { this.pick(f); }
}

/** New notes: the template new notes start from, and the note revision tasks go in. */
export function drawNewNotes(host: PageHost): { refresh: () => void } {
	const { plugin, binder, el } = host, locked = !!host.locked, folder = binder.folder;
	const draw = () => {
		el.empty();
		const all = noteTemplates(plugin), now = binder.kind === 'binder' ? ownTemplate(plugin, folder) : null;
		new Setting(el).setName('Template for new notes').setDesc(all.length || now ? 'A new note in this binder starts from it. A folder inside can choose another.' : 'Choose a templates folder in the settings of Obsidian’s Templates core plugin, and put a note in it, to start new notes from one.').addDropdown((dd) => {
			dd.addOption('', 'None');
			const list = now && !all.includes(now) ? [now, ...all] : all;
			for (const t of list) dd.addOption(t.path, t.basename);
			dd.setValue(now?.path ?? '').setDisabled(locked || binder.kind !== 'binder');
			dd.selectEl.dataset.bindersKey = 'template';
			dd.selectEl.setAttr('aria-label', 'Template for new notes');
			dd.onChange((v) => {
				const f = v ? plugin.app.vault.getFileByPath(v) : null;
				void setTemplate(plugin, folder, f ?? undefined).then(() => host.refreshSide());
			});
		});
		const named = plugin.revision.noteOf(binder);
		const row = new Setting(el).setName('Revision note').setDesc(named ? named.path : 'None yet. One is made, named Revision, with the first revision task.');
		row.settingEl.dataset.bindersKey = 'revision-note';
		if (binder.kind === 'binder') {
			row.addButton((b) => {
				b.setButtonText('Choose...').setDisabled(locked).onClick(() => new NotePicker(host, (f) => void setRevision(host, f).then(draw)).open());
				b.buttonEl.dataset.bindersKey = 'revision-choose';
			});
			if (named) row.addExtraButton((b) => {
				b.setIcon('x').setTooltip('No revision note').setDisabled(locked).onClick(() => void setRevision(host, null).then(draw));
				b.extraSettingsEl.setAttr('aria-label', 'No revision note');
				b.extraSettingsEl.dataset.bindersKey = 'revision-clear';
			});
		}
	};
	draw();
	return { refresh: () => { window.setTimeout(draw, 0); } };
}

/** Names a note as the binder's revision note (a link, so Obsidian keeps it right when the note is renamed), or none. */
async function setRevision(host: PageHost, f: TFile | null): Promise<void> {
	const { plugin, binder } = host;
	try {
		const link = f ? plugin.app.fileManager.generateMarkdownLink(f, binder.note.path) : undefined;
		await plugin.binders.setByHand(f ? `Choose the revision note of “${binder.folder.name}”` : `No revision note for “${binder.folder.name}”`, [{ note: binder.note, patch: { [REVISION_PROP]: link } }], { [REVISION_PROP]: 'the revision note' });
		plugin.binders.revisionNoteMoved(binder);
		host.refreshSide();
	} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
}
