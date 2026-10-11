import { Menu, Platform } from 'obsidian';
import { choices, toggled, isOn, noFilter, type Filter, type FilterKind, type FilterProps } from '../filter/filter';
import { keepOpen, selectMenuItem } from './internals';
import { labelDot, labelName, type LabelPreset } from './labels';

/* The toolbar's Filter menu: the statuses and labels of the folder's notes, ticked to keep, and "Clear filter". It
   knows nothing of the view beyond what the host tells it; what is ticked goes back through `setFilter`. */

/** What the menu needs of the view that opens it. */
export interface FilterMenuHost {
	/** The toolbar's Filter button: where the menu opens, and whether it is still on the page. */
	button(): HTMLElement | undefined;
	/** The filter now. */
	filter(): Filter;
	/** Puts a new filter on (the view saves it and draws again). */
	setFilter(filter: Filter): void;
	/** The status and label of each note in the folder shown. */
	notes(): FilterProps[];
	/** The statuses and labels settings list, in their order. */
	statuses(): string[];
	labels(): LabelPreset[];
	/** Opens a menu below an element, or at the mouse. */
	show(menu: Menu, e?: MouseEvent, anchor?: HTMLElement): void;
}

type At = { x: number; y: number; width: number };

/** Opens the menu. `where` and `picked` are for the menu opening again after a pick, where it was and on the item picked
    (a menu closes when an item is chosen). */
export function openFilterMenu(host: FilterMenuHost, e?: MouseEvent, where?: At, picked?: string): void {
	const button = host.button(), r = button?.getBoundingClientRect(), at = where ?? (r ? { x: r.left, y: r.bottom + 4, width: r.width } : undefined);
	const now = host.filter(), labels = host.labels(), menu = new Menu();
	const have = choices(host.notes(), now, host.statuses(), labels.map((l) => l.name));
	// On a phone or tablet the menu is a sheet from the foot of the screen: it stays where it is while things are
	// ticked in it (opened again after each pick, it would slide in again each time).
	const sheet = Platform.isMobile;
	const flip = (kind: FilterKind, v: string): boolean => {
		const next = toggled(host.filter(), kind, v);
		host.setFilter(next);
		return next[kind].includes(v);
	};
	const toggle = (kind: FilterKind, v: string, title: string) => {
		flip(kind, v);
		// the menu stays for the next pick (a menu closes when an item is chosen: it's opened again, where it was:
		// the button grows as it counts what's picked, and the menu mustn't follow it about)
		// (and the keyboard carries on from the item just picked)
		window.setTimeout(() => { if (host.button()?.isConnected) openFilterMenu(host, undefined, at, title); }, 0);
	};
	const group = (kind: FilterKind, title: string, noneTitle: string) => {
		const { values, none } = have[kind];
		if (!values.length) return;
		menu.addItem((i) => i.setSection(kind).setTitle(title).setIsLabel(true));
		for (const v of values) {
			menu.addItem((i) => {
				const t = createFragment();
				// a status shows as it's written, as on the cards; a label by its color's name
				if (kind === 'label') { labelDot(t, v, labels); t.appendText(labelName(v, labels)); } else t.appendText(v);
				i.setSection(kind).setTitle(t).setChecked(now[kind].includes(v)).onClick(() => toggle(kind, v, kind === 'label' ? labelName(v, labels) : v));
				if (sheet) keepOpen(i, () => flip(kind, v));
			});
		}
		if (none) menu.addItem((i) => { i.setSection(kind).setTitle(noneTitle).setChecked(now[kind].includes('')).onClick(() => toggle(kind, '', noneTitle)); if (sheet) keepOpen(i, () => flip(kind, '')); });
	};
	group('status', 'Status', 'No status');
	group('label', 'Label', 'No label');
	const any = have.status.values.length > 0 || have.label.values.length > 0;
	if (!any) menu.addItem((i) => i.setTitle('No statuses or labels to filter by').setIsLabel(true));
	// (on a sheet that stays open, always: there may be something to clear by the time it's wanted)
	if (isOn(now) || (sheet && any)) {
		menu.addItem((i) => i.setSection('clear').setTitle('Clear filter').setIcon('x').onClick(() => host.setFilter(noFilter())));
	}
	if (at && button) menu.showAtPosition({ ...at, overlap: true, left: false }, button.doc);
	else host.show(menu, e, button);
	if (picked !== undefined) selectMenuItem(menu, picked);
}
