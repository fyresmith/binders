/* Binders' own field for a property's value, by its kind: what is drawn when Obsidian's editors (property-widgets.ts)
   can't be. It uses Obsidian's class names for fields, so it looks like them, and reads and writes the value as its
   kind says: a list as a list of text, a number as a number, a checkbox as true or false, a date as text in the shape
   a date is kept in. Touches nothing undocumented. */

/** A property's type, as Obsidian names them. */
export type Kind = 'text' | 'multitext' | 'number' | 'checkbox' | 'date' | 'datetime' | 'tags' | 'aliases' | 'unknown';

export const KIND_ICONS: Record<Kind, string> = { text: 'lucide-text', multitext: 'lucide-list', number: 'lucide-binary', checkbox: 'lucide-check-square', date: 'lucide-calendar', datetime: 'lucide-clock', tags: 'lucide-tags', aliases: 'lucide-forward', unknown: 'lucide-file-question' };
export const KIND_NAMES: Record<Kind, string> = { text: 'Text', multitext: 'List', number: 'Number', checkbox: 'Checkbox', date: 'Date', datetime: 'Date & time', tags: 'Tags', aliases: 'Aliases', unknown: 'Unknown' };

export const DATE_SHAPE = /^\d{4}-[01]\d-[0-3]\d$/;
export const DATETIME_SHAPE = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d(:[0-5]\d(\.\d+)?)?$/;

/** The type of a value by what it is: what Obsidian itself falls back to. */
export function inferKind(v: unknown): Kind {
	if (v == null) return 'text';
	if (typeof v === 'string') return DATETIME_SHAPE.test(v) ? 'datetime' : DATE_SHAPE.test(v) ? 'date' : 'text';
	if (typeof v === 'number') return 'number';
	if (typeof v === 'boolean') return 'checkbox';
	return Array.isArray(v) ? 'multitext' : 'unknown';
}

export const isListKind = (k: Kind): boolean => k === 'multitext' || k === 'tags' || k === 'aliases';

/** A value as a list of its items: a list's own, a text or number as one, nothing as none. */
export function listOf(v: unknown): string[] {
	if (Array.isArray(v)) return (v as unknown[]).filter((x) => typeof x === 'string' || typeof x === 'number').map(String);
	return typeof v === 'string' && v !== '' ? [v] : typeof v === 'number' && !isNaN(v) ? [String(v)] : [];
}

export interface FieldContext { key: string; onChange: (value: unknown) => void }

/** Draws the field in `el`. What it calls `onChange` with is what the note should hold: a list of text, a number,
    a boolean, text (a date in its shape); null for nothing. */
export function drawField(el: HTMLElement, value: unknown, kind: Kind, c: FieldContext): { focus: () => void } {
	if (isListKind(kind)) return list(el, listOf(value), c);
	if (kind === 'checkbox') {
		const box = el.createEl('input', { cls: 'metadata-input-checkbox', type: 'checkbox', attr: { 'aria-label': c.key } });
		box.checked = value === true;
		box.addEventListener('change', () => c.onChange(box.checked));
		return { focus: () => box.focus() };
	}
	if (kind === 'unknown') {
		const input = el.createEl('input', { cls: 'metadata-input metadata-input-text', type: 'text', attr: { 'aria-label': c.key, readonly: 'true' } });
		input.value = JSON.stringify(value) ?? '';
		return { focus: () => input.focus() };
	}
	const number = kind === 'number', dated = kind === 'date' || kind === 'datetime';
	const input = el.createEl('input', { cls: `metadata-input metadata-input-${number ? 'number' : 'text'}`, type: number ? 'number' : 'text', attr: { 'aria-label': c.key } });
	if (dated) input.placeholder = kind === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:MM';
	input.value = typeof value === 'string' || (typeof value === 'number' && !isNaN(value)) ? String(value) : '';
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
	input.addEventListener('change', () => {
		const typed = input.value.trim();
		input.removeAttribute('aria-invalid');
		if (!typed) { c.onChange(null); return; }
		if (number) {
			const n = Number(typed);
			if (isNaN(n)) { input.setAttr('aria-invalid', 'true'); return; }
			c.onChange(n);
		} else if (dated) {
			if (!(kind === 'date' ? DATE_SHAPE : DATETIME_SHAPE).test(typed)) { input.setAttr('aria-invalid', 'true'); return; }
			c.onChange(typed);
		} else c.onChange(typed);
	});
	return { focus: () => input.focus() };
}

/** A list: the items with a small × each, and a field to type the next in (Enter or a comma ends an item). */
function list(el: HTMLElement, start: string[], c: FieldContext): { focus: () => void } {
	let items = [...start];
	const box = el.createDiv({ cls: 'multi-select-container' });
	const input = box.createEl('input', { cls: 'multi-select-input', type: 'text', attr: { 'aria-label': c.key } });
	const draw = (): void => {
		box.querySelectorAll('.multi-select-pill').forEach((p) => p.remove());
		for (const [i, item] of items.entries()) {
			const pill = createDiv({ cls: 'multi-select-pill' });
			pill.createDiv({ cls: 'multi-select-pill-content', text: item });
			const x = pill.createDiv({ cls: 'multi-select-pill-remove-button', attr: { 'aria-label': `Remove ${item}`, role: 'button' } });
			x.setText('×');
			x.addEventListener('click', () => set(items.filter((_, j) => j !== i)));
			box.insertBefore(pill, input);
		}
	};
	const set = (next: string[]): void => { items = next; draw(); c.onChange(items.length ? items : null); };
	const take = (): void => {
		const typed = input.value.replace(/,/g, ' ').trim();
		input.value = '';
		if (typed && !items.includes(typed)) set([...items, typed]);
	};
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); take(); }
		else if (e.key === 'Backspace' && !input.value && items.length) set(items.slice(0, -1));
	});
	input.addEventListener('blur', take);
	draw();
	return { focus: () => input.focus() };
}
