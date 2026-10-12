import type { Menu } from 'obsidian';
import { submenu } from './internals';
import { CARD_SIZES, type CardSize } from './lanes-data';

/* The drawers of the "More options" menu that more than one mode has. */

const display = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A switch in a drawer: its name, whether it is on, and what flips it. */
export interface Switch { title: string; icon: string; on: boolean; flip: () => void }

/** "Cards": how big they are (the one ticked), then how they are drawn. One drawer where there were a submenu and
    two or three rows. */
export function cardsDrawer(menu: Menu, size: CardSize, setSize: (s: CardSize) => void, switches: Switch[]): void {
	menu.addItem((i) => {
		i.setSection('view').setTitle('Cards').setIcon('scaling');
		submenu(i, (m) => {
			for (const s of CARD_SIZES) m.addItem((x) => x.setSection('size').setTitle(display(s)).setChecked(size === s).onClick(() => setSize(s)));
			for (const w of switches) m.addItem((x) => x.setSection('look').setTitle(w.title).setChecked(w.on).onClick(() => w.flip()));
		}, menu);
	});
}
