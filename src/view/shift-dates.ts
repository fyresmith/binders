import { ButtonComponent, DropdownComponent, Modal, Notice, Setting, TextComponent, type TFile } from 'obsidian';
import { shiftStoryDates } from './props';
import { buttonRow, cancelButton } from './modals';
import type { ModeContext } from './mode';
import type { ShiftUnit } from '../time/shift';

/* "Shift story dates...": moves the story dates of the selected scenes earlier or later by a number of days, months or
   years, keeping the space between them. One dialog, one change for "Undo". Offered in every mode when more than one
   dated note is selected (actions.ts). */

const UNITS: [ShiftUnit, string][] = [['d', 'Days'], ['m', 'Months'], ['y', 'Years']];

/** Asks how far, and which way. Resolves with the signed number and its unit, or null. */
function askShift(ctx: ModeContext, count: number): Promise<{ by: number; unit: ShiftUnit } | null> {
	return new Promise((resolve) => {
		let way: 'earlier' | 'later' = 'later', unit: ShiftUnit = 'd', typed = '1', ok = false;
		const m = new Modal(ctx.app);
		m.setTitle('Shift story dates');
		m.contentEl.createEl('p', { text: `Moves the story dates of ${count} scenes together, keeping the space between them.` });
		new Setting(m.contentEl).setName('Move').addDropdown((d: DropdownComponent) => d.addOption('later', 'Later').addOption('earlier', 'Earlier').setValue(way).onChange((v) => { way = v === 'earlier' ? 'earlier' : 'later'; }));
		let field: TextComponent | null = null;
		new Setting(m.contentEl).setName('By').addText((t) => { field = t; t.setValue(typed).onChange((v) => { typed = v; refuse(null); }); t.inputEl.inputMode = 'numeric'; t.inputEl.setAttr('aria-label', 'Number'); })
			.addDropdown((d: DropdownComponent) => { for (const [id, name] of UNITS) d.addOption(id, name); d.setValue(unit).onChange((v) => { unit = v === 'm' || v === 'y' ? v : 'd'; }); d.selectEl.setAttr('aria-label', 'Unit'); });
		const why = m.contentEl.createDiv({ cls: 'binders-ask-error', attr: { 'aria-live': 'polite' } });
		const refuse = (reason: string | null) => { why.setText(reason ?? ''); field?.inputEl.toggleClass('is-invalid', !!reason); };
		const done = () => {
			if (!/^\s*\d{1,6}\s*$/.test(typed) || !Number(typed)) { refuse('Type a whole number, more than 0.'); field?.inputEl.focus(); return; }
			ok = true;
			m.close();
		};
		const row = buttonRow(m);
		new ButtonComponent(row).setButtonText('Shift').setCta().onClick(done);
		cancelButton(row, m);
		m.scope.register([], 'Enter', (e) => { if (e.isComposing) return; e.preventDefault(); done(); });
		window.setTimeout(() => field?.inputEl.select(), 0);
		m.onClose = () => resolve(ok ? { by: Number(typed) * (way === 'earlier' ? -1 : 1), unit } : null);
		m.open();
	});
}

/** The dialog, then the shift. Says on a notice what it could not move, or why it could not write. */
export async function shiftDialog(ctx: ModeContext, notes: readonly TFile[]): Promise<void> {
	try {
		if (ctx.readOnly) throw new Error('This binder is read only.');
		const answer = await askShift(ctx, notes.length);
		if (!answer) return;
		const { moved, kept } = await shiftStoryDates(ctx.plugin, notes, answer.by, answer.unit);
		// (a month can't be moved by days, nor a year by months or days: those scenes stay where they are)
		if (kept) new Notice(`${moved} moved. ${kept === 1 ? '1 scene stays' : `${kept} scenes stay`} as ${kept === 1 ? 'it is' : 'they are'}: ${kept === 1 ? 'its date' : 'their dates'} can’t be moved by ${answer.unit === 'd' ? 'days' : answer.unit === 'm' ? 'months' : 'years'}.`);
	} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
}
