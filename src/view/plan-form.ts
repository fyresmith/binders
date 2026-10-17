import { Setting } from 'obsidian';
import { WEEK } from '../progress/plan';

/* The fields of a plan: the words a book is to have, the day they are to be written by, and the days of the week that are
   written on. One set of rows, drawn in the Progress window's form (with its Save) and on Binder settings' Goal page
   (each change kept as made). What is typed is a draft; what a change does is the caller's. */

export const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** What is typed in the plan's fields: the target as text, the deadline as YYYY-MM-DD ('' for none). */
export interface PlanDraft { target: string; deadline: string; days: number[] }

export interface PlanFieldsOptions {
	/** "The words this folder is to have." or "The words the book is to have." */
	about: string;
	/** Kept in `data-binders-key` as `<key>-target`, `<key>-deadline` and `<key>-day-<n>`. */
	key: string;
	/** A field changed (a text or a date: when it is left or Enter is pressed; a day: when it is clicked). */
	changed?: (field: 'target' | 'deadline' | 'days') => void;
	/** Nothing can be changed (the binder can't be written). */
	locked?: boolean;
}

/** Draws the three rows into `form`, reading and writing `d`. */
export function drawPlanFields(form: HTMLElement, d: PlanDraft, o: PlanFieldsOptions): void {
	new Setting(form).setName('Word count target').setDesc(o.about).addText((t) => {
		t.setPlaceholder('Such as 80,000').setValue(d.target).setDisabled(!!o.locked).onChange((v) => { d.target = v; });
		t.inputEl.setAttrs({ inputmode: 'numeric', 'data-binders-key': `${o.key}-target`, 'aria-label': 'Word count target' });
		// (kept when the field is left or Enter is pressed, not at each digit)
		t.inputEl.addEventListener('change', () => o.changed?.('target'));
	});
	new Setting(form).setName('Deadline').setDesc('The day the words are to be written by.').addText((t) => {
		t.inputEl.type = 'date';
		t.setValue(d.deadline).setDisabled(!!o.locked).onChange((v) => { d.deadline = v; });
		t.inputEl.setAttrs({ 'data-binders-key': `${o.key}-deadline`, 'aria-label': 'Deadline' });
		t.inputEl.addEventListener('change', () => o.changed?.('deadline'));
	});
	const row = new Setting(form).setName('Writing days').setDesc('The days of the week that are written on. The plan shares the words among them.');
	const group = row.controlEl.createDiv({ cls: 'binders-pot-weekdays', attr: { role: 'group', 'aria-label': 'Writing days' } });
	for (const day of WEEK) {
		const full = new Date(Date.UTC(2026, 9, 11 + day)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), on = d.days.includes(day);
		const b = group.createEl('button', { cls: `text-icon-button binders-pot-weekday${on ? ' is-active' : ''}`, text: LETTERS[day], attr: { 'aria-label': full, 'aria-pressed': String(on), 'data-binders-key': `${o.key}-day-${day}` } });
		b.disabled = !!o.locked;
		b.addEventListener('click', () => {
			d.days = d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day];
			b.toggleClass('is-active', d.days.includes(day));
			b.setAttr('aria-pressed', String(d.days.includes(day)));
			o.changed?.('days');
		});
	}
}
