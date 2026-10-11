import { Platform, setIcon } from 'obsidian';

/* A list to pick from, under a button, with a field to search it: what a Bases filter's property, operator and value
   comboboxes are. Made of Obsidian's own menu classes (`menu`, `menu-item`), so it looks like a menu and is a sheet on a
   phone, with a search field a Menu hasn't. The Filter popover opens these; while one is open (or has just shut) a press
   of Escape or a click is the picker's, not the popover's. */

export interface PickItem {
	id: string;
	/** What it is called; `build` draws it instead (a label's color, a link). */
	title: string;
	build?: (parent: HTMLElement) => void;
	icon?: string;
	/** How many notes have it, said at the end. */
	count?: number;
	checked?: boolean;
	/** A line between this and the one before. */
	apart?: boolean;
}

export interface PickOptions {
	/** Several can be ticked: picking leaves the list open and ticks the item. */
	multi: boolean;
	placeholder: string;
	items(): PickItem[];
	onPick(item: PickItem): void;
	/** What the writer typed, as an item of its own to pick ("Use “xyz”"), if that means something here. */
	typed?(text: string): PickItem | null;
	onClose?(): void;
}

const busy = { open: 0, shut: 0 };
/** Is a picker open, or was one just now (its Escape or click is spent)? */
export const pickerBusy = (): boolean => busy.open > 0 || Date.now() - busy.shut < 150;

/** Opens the list under `anchor`. */
export function openPicker(anchor: HTMLElement, o: PickOptions): void {
	const doc = anchor.doc, phone = Platform.isPhone;
	const el = doc.body.createDiv({ cls: 'menu binders-picker', attr: { role: 'dialog' } });
	if (phone) el.createDiv({ cls: 'menu-grabber' });
	const field = el.createDiv({ cls: 'binders-picker-search' });
	const input = field.createEl('input', { type: 'text', cls: 'binders-picker-input', attr: { placeholder: o.placeholder, 'aria-label': o.placeholder, role: 'combobox', 'aria-expanded': 'true', 'aria-autocomplete': 'list' } });
	const list = el.createDiv({ cls: 'menu-scroll', attr: { role: 'listbox', 'aria-multiselectable': o.multi ? 'true' : 'false' } });
	let shown: PickItem[] = [], at = 0, closed = false;
	busy.open++;

	const close = (back = true) => {
		if (closed) return;
		closed = true;
		busy.open = Math.max(0, busy.open - 1);
		busy.shut = Date.now();
		doc.removeEventListener('mousedown', down, true);
		doc.removeEventListener('touchstart', down, true);
		el.remove();
		if (back && anchor.isConnected) anchor.focus({ preventScroll: true });
		o.onClose?.();
	};
	const fits = (it: PickItem, q: string) => !q || it.title.toLowerCase().includes(q);
	const draw = () => {
		const q = input.value.trim().toLowerCase();
		const top = list.scrollTop;
		list.empty();
		shown = o.items().filter((it) => fits(it, q));
		const t = q && o.typed ? o.typed(input.value.trim()) : null;
		if (t && !shown.some((s) => s.title.toLowerCase() === q)) shown.push({ ...t, apart: true });
		at = Math.max(0, Math.min(at, shown.length - 1));
		shown.forEach((it, i) => {
			if (it.apart && i) list.createDiv({ cls: 'menu-separator' });
			const row = list.createDiv({ cls: 'menu-item tappable' + (i === at ? ' selected' : ''), attr: { role: 'option', 'aria-selected': String(!!it.checked) } });
			const ic = row.createDiv({ cls: 'menu-item-icon' });
			if (it.checked) setIcon(ic, 'check'); else if (it.icon) setIcon(ic, it.icon);
			const title = row.createDiv({ cls: 'menu-item-title' });
			if (it.build) it.build(title); else title.setText(it.title);
			if (it.count) row.createDiv({ cls: 'menu-item-end binders-picker-count', text: String(it.count) });
			row.addEventListener('mousemove', () => { if (at !== i) { list.querySelector('.selected')?.removeClass('selected'); at = i; row.addClass('selected'); } });
			row.addEventListener('click', (e) => { e.preventDefault(); pick(i); });
		});
		if (!shown.length) list.createDiv({ cls: 'menu-item binders-picker-none', text: q ? 'Nothing matches' : 'Nothing to pick' });
		list.scrollTop = top;
		list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
	};
	const pick = (i: number) => {
		const it = shown[i];
		if (!it) return;
		o.onPick(it);
		if (o.multi) {
			// (ticked or unticked in place; the list stays, the text typed is cleared so the next pick starts afresh)
			input.value = '';
			draw();
			input.focus();
		} else close();
	};
	const down = (e: MouseEvent | TouchEvent) => { if (!(e.target instanceof Node) || el.contains(e.target) || anchor.contains(e.target)) return; close(false); };
	input.addEventListener('input', () => { at = 0; draw(); });
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (shown.length) at = (at + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
			draw();
		} else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
		else if (e.key === 'Tab') close(false);
	});
	doc.addEventListener('mousedown', down, true);
	doc.addEventListener('touchstart', down, true);
	draw();
	if (!phone) {
		const r = anchor.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
		el.setCssStyles({ minWidth: `${Math.max(180, Math.round(r.width))}px` });
		const w = el.offsetWidth, h = Math.min(el.offsetHeight, 320), room = vh - r.bottom - 12;
		// below the button; above it when there's no room below
		const above = room < Math.min(h, 200) && r.top > room;
		el.setCssStyles({ left: `${Math.max(8, Math.min(r.left, vw - w - 8))}px`, top: above ? '' : `${r.bottom + 2}px`, bottom: above ? `${vh - r.top + 2}px` : '', maxHeight: `${Math.max(140, above ? r.top - 12 : room)}px` });
	}
	input.focus({ preventScroll: true });
}
