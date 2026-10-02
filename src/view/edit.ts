import { Keymap, Notice } from 'obsidian';

/* Text edited in place: a synopsis on a card, a heading or the view itself, or a title. It shows as text; clicking it
   (or `edit()`) swaps in a field. A synopsis saves on blur or Mod-Enter (Enter is a new line); a title saves on Enter.
   Escape cancels. What's typed is never dropped: it stays in the field until it's saved, and a failed save keeps it. */

/** What a text edited in place is told: what it shows, how it's typed, and how it's saved. */
export interface EditableOptions {
	cls: string;
	value: string;
	/** What the field holds when editing starts, if not what's shown (a number shown as "1,500" is typed as 1500). */
	editValue?: string;
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
	/** The field takes a number: a phone shows its number keys. */
	numeric?: boolean;
	/** A single line emptied is saved as empty (a cell's value taken away); otherwise that's leaving it as it was. */
	allowEmpty?: boolean;
	save(text: string): Promise<void>;
	/** Editing started (true) or ended (false), whether saved or not. */
	onEditing?(editing: boolean): void;
}

/** One text edited in place: its element, starting an edit, and saving it. */
export interface Editable {
	el: HTMLElement;
	/** Starts editing. `at`: where the caret goes in the text (default: its end; a single line is selected whole). */
	edit(at?: number): void;
	/** Saves what's typed and ends the edit. With `keep`, saves and leaves the field as it is (the app is going to the
	    background: what's typed is safe, and still there to carry on with). */
	commit(keep?: boolean): Promise<void>;
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
/** Saves every edit under way inside `root` (and any whose element has left the page). `keep`: see `Editable.commit`. */
export const commitAll = (root: HTMLElement, keep = false): Promise<unknown> => Promise.all([...open].filter((e) => root.contains(e.el) || !e.el.isConnected).map((e) => e.commit(keep)));

/** Holders that already keep presses beside their field from ending an edit. */
const guarded = new WeakSet<HTMLElement>();

/** Puts a text in `parent` that swaps in a field when it's clicked or `edit()` is called. The header says when it saves. */
export function editable(parent: HTMLElement, o: EditableOptions): Editable {
	const tag = o.singleLine ? 'input' : 'textarea';
	// (`dir="auto"`: text in a right-to-left script reads from the right, whatever the interface's direction)
	const el = parent.createDiv({ cls: ['binders-editable', o.cls], attr: { dir: 'auto' } });
	let field: HTMLInputElement | HTMLTextAreaElement | null = null, saving = false, refused: string | null = null;
	let left = false; // the commit under way came from leaving the field
	let refusedAt = 0; // when what's in the field was first refused
	const typed = () => o.editValue ?? o.value;
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
		// the caret goes where the click was, as in any text
		const caretAt = (e: MouseEvent): number | undefined => {
			if (el.hasClass('is-empty') || o.singleLine) return undefined;
			// (the standard way, and the one Chromium had before it)
			const doc = el.doc as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => { startContainer: Node; startOffset: number } | null };
			const p = doc.caretPositionFromPoint?.(e.clientX, e.clientY), r = p ? null : doc.caretRangeFromPoint?.(e.clientX, e.clientY);
			const node = p?.offsetNode ?? r?.startContainer, at = p?.offset ?? r?.startOffset;
			return node && node.nodeType === Node.TEXT_NODE && el.contains(node) ? at : undefined;
		};
		el.addEventListener('click', (e) => { if (!field && !Keymap.isModEvent(e) && !e.shiftKey && (o.shouldEdit?.(e) ?? true)) ed.edit(caretAt(e)); });
		if (o.focusable) {
			el.setAttrs({ tabindex: '0', role: 'button' });
			el.addEventListener('keydown', (e) => { if (!field && e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ed.edit(); } });
		}
	}

	const end = (text: string) => {
		const f = field, focused = !!f && f.ownerDocument.activeElement === f;
		field = null;
		refused = null;
		open.delete(ed);
		el.removeClasses(['is-editing', 'is-invalid']);
		show(text);
		o.onEditing?.(false);
		// Escape or Enter: the focus goes back to what holds the text (the card), not to the page
		if (focused) (el.matches('[tabindex]') ? el : el.parentElement?.closest<HTMLElement>('[tabindex]'))?.focus({ preventScroll: true });
	};

	const ed: Editable = {
		el,
		get editing() { return !!field; },
		edit(at?: number) {
			if (field || o.readOnly) return;
			el.empty();
			el.addClass('is-editing');
			el.removeClass('is-empty');
			const f = field = el.createEl(tag, { cls: 'binders-edit-field', attr: { placeholder: o.placeholder, 'aria-label': o.label ?? o.placeholder, spellcheck: 'true', ...(o.singleLine ? { enterkeyhint: 'done' } : { rows: '1' }) } });
			f.value = typed();
			if (o.numeric) f.inputMode = 'numeric';
			open.add(ed);
			o.onEditing?.(true);
			const fit = () => { if (f instanceof HTMLTextAreaElement) { f.setCssStyles({ height: '0px' }); f.setCssStyles({ height: `${f.scrollHeight}px` }); } };
			f.addEventListener('input', () => { fit(); el.removeClass('is-invalid'); });
			f.addEventListener('keydown', (e: KeyboardEvent) => {
				e.stopPropagation(); // the board's keys (arrows, Delete, Enter) are for cards, not for typing
				if (e.key === 'Escape') { e.preventDefault(); end(o.value); }
				else if (e.key === 'Enter' && !e.isComposing && (o.singleLine || Keymap.isModEvent(e))) { e.preventDefault(); void ed.commit(); }
				// Tab saves too, and the focus stays with what holds the text (the card, the row) instead of leaving the view
				else if (e.key === 'Tab' && !e.isComposing && !Keymap.isModEvent(e) && !e.altKey) { e.preventDefault(); void ed.commit(); }
			});
			f.addEventListener('blur', () => { left = true; void ed.commit().finally(() => { left = false; }); });
			// a press beside the field, still inside what holds it (the rest of a card's synopsis box, say), is a press
			// on the text being edited: it doesn't end the edit, or start a drag or a selection around it
			if (!guarded.has(el)) {
				guarded.add(el);
				for (const t of ['mousedown', 'pointerdown', 'click', 'dblclick'] as const) el.addEventListener(t, (e) => {
					if (!el.hasClass('is-editing') || (e.target as HTMLElement).hasClass('binders-edit-field')) return;
					e.stopPropagation();
					if (t === 'mousedown') e.preventDefault();
				});
			}
			// the field's own clicks and presses mustn't select, drag or open the card around it
			for (const t of ['click', 'dblclick', 'pointerdown', 'contextmenu'] as const) f.addEventListener(t, (e) => e.stopPropagation());
			f.focus();
			if (f instanceof HTMLTextAreaElement) { const p = Math.min(at ?? f.value.length, f.value.length); f.setSelectionRange(p, p); } else f.select();
			fit();
		},
		async commit(keep = false) {
			if (!field || saving) return;
			const read = () => (field ? (o.singleLine ? field.value.trim() : field.value.replace(/\s+$/, '')) : '');
			const text = read();
			if (text === typed().trim() || (o.singleLine && !text && !o.allowEmpty)) { if (!keep) end(o.value); return; }
			saving = true;
			try {
				await o.save(text);
				o.value = text;
				if (o.editValue !== undefined) o.editValue = text;
				// (typed in while it was being saved, on a slow phone say: that's saved too, not thrown away with the field)
				// (the field left meanwhile or not: a leave while this save was under way was told to wait for it)
				if (field && read() !== text) { saving = false; await ed.commit(keep); return; }
				if (!keep) end(text);
			} catch (e) {
				// keep the text in the field, so nothing typed is lost; why is said once for the same text, and the
				// field stays marked until it's changed
				// (left a second time with the same text that can't be saved: it's given up, and what was there stays.
				// Without that there'd be no way out of the field on a phone, which has no Escape.)
				// Only a line (a name, a number), and only on a later press than the one that was told why: a single tap
				// leaves a field twice (the press, then whatever it lands on taking the focus). A synopsis is writing:
				// it stays in its field until it can be saved.
				if (o.singleLine && refused === text && left && performance.now() - refusedAt > 400) { end(o.value); return; }
				if (refused !== text) { new Notice(e instanceof Error ? e.message : String(e)); refusedAt = performance.now(); }
				refused = text;
				el.addClass('is-invalid');
				field?.focus();
			} finally { saving = false; }
		},
	};
	return ed;
}
