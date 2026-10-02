import { ButtonComponent, ColorComponent, DropdownComponent, Modal, TextComponent, type App } from 'obsidian';
import { PALETTE, display, hexColor, type LabelPreset } from './labels';

/* Small dialogs built from Obsidian's Modal, laid out as its own are: what it asks, a field if it needs one, and the
   buttons in Obsidian's button row. Each resolves once it closes. */

/** Makes a dialog one of Obsidian's own small ones (its `mod-confirmation`): on a phone it's a sheet from the bottom
    of the screen, its title has the full width (there's no ✕ to make room for), and its buttons are a column with
    Cancel last. Returns the row its buttons go in, at the foot of the dialog. */
export function buttonRow(m: Modal): HTMLElement {
	m.containerEl.addClass('mod-confirmation');
	return m.modalEl.createDiv({ cls: 'modal-button-container' });
}

/** A dialog's Cancel button, marked as Obsidian marks its own (which is what puts it last on a phone). */
export function cancelButton(row: HTMLElement, m: Modal): ButtonComponent {
	const b = new ButtonComponent(row).setButtonText('Cancel').onClick(() => m.close());
	b.buttonEl.addClass('mod-cancel');
	return b;
}

/** The row of buttons at the foot of a dialog, as Obsidian's own dialogs have it: what it does first, Cancel last. */
function buttons(m: Modal, cta: string, done: () => void, warning = false): ButtonComponent {
	const row = buttonRow(m);
	const go = new ButtonComponent(row).setButtonText(cta).onClick(done);
	// (a deletion's button is filled, in the color of a warning, as Obsidian's own is)
	go.setCta();
	if (warning) go.buttonEl.addClass('mod-destructive');
	cancelButton(row, m);
	return go;
}

/** Asks before something that can't be undone from here. Resolves true for the confirming button. */
export function confirm(app: App, o: { title: string; text: string; cta: string; warning?: boolean }): Promise<boolean> {
	return new Promise((resolve) => {
		let ok = false;
		const m = new Modal(app);
		m.setTitle(o.title);
		m.contentEl.createEl('p', { text: o.text });
		const go = buttons(m, o.cta, () => { ok = true; m.close(); }, o.warning);
		window.setTimeout(() => go.buttonEl.focus(), 0); // Enter confirms, as in Obsidian's own dialogs
		m.onClose = () => resolve(ok);
		m.open();
	});
}

/** A field that fills the dialog, and under it a line for why what's typed can't be used (empty until it can't). */
function field(m: Modal, placeholder: string, value: string): { text: TextComponent; refuse(why: string | null): void } {
	const box = m.contentEl.createDiv({ cls: 'binders-ask' });
	const text = new TextComponent(box).setPlaceholder(placeholder).setValue(value);
	const why = m.contentEl.createDiv({ cls: 'binders-ask-error', attr: { 'aria-live': 'polite' } });
	const refuse = (reason: string | null) => { why.setText(reason ?? ''); text.inputEl.toggleClass('is-invalid', !!reason); if (reason) { text.inputEl.focus(); text.inputEl.select(); } };
	text.inputEl.addEventListener('input', () => refuse(null));
	return { text, refuse };
}

/** Asks for a line of text. Resolves with it (trimmed), or null if cancelled or empty (with `allowEmpty`, an emptied
    field is an answer too: ""). `check` says why an answer can't be used (or null if it can): the dialog then stays
    open with what was typed, and says so. `empty` is what it says, staying open, when nothing was typed and that's
    no answer (as "New label" does); without it, nothing typed closes the dialog as Cancel does. */
export function ask(app: App, o: { title: string; placeholder: string; cta: string; value?: string; allowEmpty?: boolean; numeric?: boolean; empty?: string; check?(value: string): string | null }): Promise<string | null> {
	return new Promise((resolve) => {
		let value = o.value ?? '', ok = false;
		const m = new Modal(app);
		m.setTitle(o.title);
		const f = field(m, o.placeholder, value);
		// (a number: a phone shows its number keys)
		if (o.numeric) f.text.inputEl.inputMode = 'numeric';
		const done = () => {
			const why = value.trim() || o.allowEmpty ? o.check?.(value.trim()) ?? null : o.empty ?? null;
			if (why) { f.refuse(why); return; }
			ok = true;
			m.close();
		};
		f.text.onChange((v) => { value = v; });
		f.text.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
		window.setTimeout(() => f.text.inputEl.select(), 0);
		buttons(m, o.cta, done);
		m.onClose = () => resolve(ok && (value.trim() || o.allowEmpty) ? value.trim() : null);
		m.open();
	});
}

/** Asks for a color, with Obsidian's own color picker and a field for a hex color. Resolves with "#rrggbb", or null. */
export function pickColor(app: App, o: { title: string; value: string; cta: string }): Promise<string | null> {
	return new Promise((resolve) => {
		let value = hexColor(o.value) ?? '#808080', ok = false;
		const m = new Modal(app);
		m.setTitle(o.title);
		const f = field(m, 'Hex color, such as #7c3aed', value);
		// "7c3aed" is a color too: the # is only how it's usually written
		const read = (v: string) => hexColor(v.trim()) ?? hexColor('#' + v.trim());
		const done = () => {
			// what's in the field is what's asked for: if it isn't a color, the dialog says so and stays
			const typed = read(f.text.getValue());
			if (!typed) { f.refuse('That isn’t a color. Write it as #rrggbb, or pick one.'); return; }
			value = typed;
			ok = true;
			m.close();
		};
		let typing = false;
		f.text.inputEl.setAttr('aria-label', 'Hex color');
		f.text.inputEl.parentElement?.addClass('mod-color');
		// (the picker follows what's typed, and mustn't write its own spelling of it back into the field meanwhile)
		const picker = new ColorComponent(f.text.inputEl.parentElement ?? m.contentEl).setValue(value).onChange((c) => { if (typing) return; value = hexColor(c) ?? value; f.text.setValue(value); f.refuse(null); });
		f.text.onChange((v) => { const c = read(v); if (c) { value = c; typing = true; try { picker.setValue(c); } finally { typing = false; } } });
		f.text.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
		window.setTimeout(() => f.text.inputEl.select(), 0);
		buttons(m, o.cta, done);
		m.onClose = () => resolve(ok ? value : null);
		m.open();
	});
}

/** Asks for a new label: its name, and one of Obsidian's colors (the first no label has yet is offered; any color can
    be given it later in settings). Resolves with the label, or null. `taken`: the labels there are, whose names it
    can't have. */
export function newLabel(app: App, taken: readonly LabelPreset[]): Promise<LabelPreset | null> {
	return new Promise((resolve) => {
		const used = new Set(taken.map((l) => l.color));
		let name = '', color: string = PALETTE.find((c) => !used.has(c)) ?? PALETTE[0], ok = false;
		const m = new Modal(app);
		m.setTitle('New label');
		const f = field(m, 'Name, such as a character or a storyline', name);
		f.text.inputEl.setAttr('aria-label', 'Label name');
		f.text.inputEl.parentElement?.addClass('mod-color');
		const pick = new DropdownComponent(f.text.inputEl.parentElement ?? m.contentEl);
		for (const c of PALETTE) pick.addOption(c, display(c));
		pick.setValue(color).onChange((c) => { color = c; });
		pick.selectEl.setAttr('aria-label', 'Color');
		const done = () => {
			const n = name.trim();
			const why = !n ? 'A label needs a name.' : taken.some((l) => l.name.toLowerCase() === n.toLowerCase()) ? `There’s a label called “${n}” already.` : null;
			if (why) { f.refuse(why); return; }
			ok = true;
			m.close();
		};
		f.text.onChange((v) => { name = v; });
		f.text.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
		window.setTimeout(() => f.text.inputEl.focus(), 0);
		buttons(m, 'Add label', done);
		m.onClose = () => resolve(ok ? { name: name.trim(), color } : null);
		m.open();
	});
}
