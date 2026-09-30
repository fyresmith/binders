import { Keymap, Notice } from 'obsidian';

/* Text edited in place: a synopsis on a card, a heading or the view itself, or a title. It shows as text; clicking it
   (or `edit()`) swaps in a field. A synopsis saves on blur or Mod-Enter (Enter is a new line); a title saves on Enter.
   Escape cancels. What's typed is never dropped: it stays in the field until it's saved, and a failed save keeps it. */

export interface EditableOptions {
	cls: string;
	value: string;
	placeholder: string;
	/** A single line (a title): Enter saves. Otherwise Enter is a new line and Mod-Enter saves. */
	singleLine?: boolean;
	readOnly?: boolean;
	/** Starts editing on click. Off when something else (a menu, a key) starts it. */
	clickToEdit?: boolean;
	/** Reachable with Tab, and Enter starts editing (for text that isn't inside something else focusable, like a card). */
	focusable?: boolean;
	/** Whether this click should start editing (e.g. a tap only edits a card that's already selected). */
	shouldEdit?(e: MouseEvent): boolean;
	label?: string;
	save(text: string): Promise<void>;
	/** Editing started (true) or ended (false), whether saved or not. */
	onEditing?(editing: boolean): void;
}

export interface Editable {
	el: HTMLElement;
	edit(): void;
	/** Saves what's typed, if editing. */
	commit(): Promise<void>;
	readonly editing: boolean;
}

/** Everything being edited right now, so a closing view can save it. */
const open = new Set<Editable>();
/** Saves the field being typed in, if it's one of these; false if it isn't (so the key goes on to Obsidian). */
export function commitFocused(): boolean {
	const ed = [...open].find((e) => e.el.contains(e.el.doc.activeElement));
	if (!ed) return false;
	void ed.commit();
	return true;
}
export const commitAll = (root: HTMLElement): Promise<unknown> => Promise.all([...open].filter((e) => root.contains(e.el) || !e.el.isConnected).map((e) => e.commit()));

export function editable(parent: HTMLElement, o: EditableOptions): Editable {
	const tag = o.singleLine ? 'input' : 'textarea';
	const el = parent.createDiv({ cls: ['binders-editable', o.cls] });
	let field: HTMLInputElement | HTMLTextAreaElement | null = null, saving = false;
	const show = (text: string) => {
		el.empty();
		el.toggleClass('is-empty', !text);
		el.setText(text || (o.readOnly ? '' : o.placeholder));
	};
	show(o.value);
	if (!o.readOnly && o.clickToEdit !== false) {
		el.addClass('is-editable');
		if (o.label) el.setAttr('aria-label', o.label);
		// the click still reaches the card around it (which selects the card), after the field has focus
		el.addEventListener('click', (e) => { if (!field && !Keymap.isModEvent(e) && !e.shiftKey && (o.shouldEdit?.(e) ?? true)) ed.edit(); });
		if (o.focusable) {
			el.setAttrs({ tabindex: '0', role: 'button' });
			el.addEventListener('keydown', (e) => { if (!field && e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ed.edit(); } });
		}
	}

	const end = (text: string) => {
		const f = field, focused = !!f && f.ownerDocument.activeElement === f;
		field = null;
		open.delete(ed);
		el.removeClass('is-editing');
		show(text);
		o.onEditing?.(false);
		// Escape or Enter: the focus goes back to what holds the text (the card), not to the page
		if (focused) (el.matches('[tabindex]') ? el : el.parentElement?.closest<HTMLElement>('[tabindex]'))?.focus({ preventScroll: true });
	};

	const ed: Editable = {
		el,
		get editing() { return !!field; },
		edit() {
			if (field || o.readOnly) return;
			el.empty();
			el.addClass('is-editing');
			el.removeClass('is-empty');
			const f = field = el.createEl(tag, { cls: 'binders-edit-field', attr: { placeholder: o.placeholder, 'aria-label': o.label ?? o.placeholder, spellcheck: 'true', ...(o.singleLine ? {} : { rows: '1' }) } });
			f.value = o.value;
			open.add(ed);
			o.onEditing?.(true);
			const fit = () => { if (f instanceof HTMLTextAreaElement) { f.setCssStyles({ height: '0px' }); f.setCssStyles({ height: `${f.scrollHeight}px` }); } };
			f.addEventListener('input', fit);
			f.addEventListener('keydown', (e: KeyboardEvent) => {
				e.stopPropagation(); // the board's keys (arrows, Delete, Enter) are for cards, not for typing
				if (e.key === 'Escape') { e.preventDefault(); end(o.value); }
				else if (e.key === 'Enter' && !e.isComposing && (o.singleLine || Keymap.isModEvent(e))) { e.preventDefault(); void ed.commit(); }
			});
			f.addEventListener('blur', () => { void ed.commit(); });
			// the field's own clicks and presses mustn't select, drag or open the card around it
			for (const t of ['click', 'dblclick', 'pointerdown', 'contextmenu'] as const) f.addEventListener(t, (e) => e.stopPropagation());
			f.focus();
			if (f instanceof HTMLTextAreaElement) f.setSelectionRange(f.value.length, f.value.length); else f.select();
			fit();
		},
		async commit() {
			if (!field || saving) return;
			const text = o.singleLine ? field.value.trim() : field.value.replace(/\s+$/, '');
			if (text === o.value.trim() || (o.singleLine && !text)) { end(o.value); return; }
			saving = true;
			try {
				await o.save(text);
				o.value = text;
				end(text);
			} catch (e) {
				// keep the text in the field, so nothing typed is lost
				new Notice(e instanceof Error ? e.message : String(e));
				field?.focus();
			} finally { saving = false; }
		},
	};
	return ed;
}
