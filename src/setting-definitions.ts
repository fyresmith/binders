import type { ExtraButtonComponent, Setting } from 'obsidian';

/* The parts of Obsidian 1.13's declarative settings that the settings tab uses, said here rather than imported from
   'obsidian': Obsidian's review checks a plugin against older typings that don't have them, and calls everything
   typed by them unsafe. They are the same shapes, so Obsidian's own types take them as they are. */

interface Row {
	name: string;
	desc?: string | DocumentFragment;
	/** Other words the settings' search finds the row by ("colour", "daily goal"). */
	aliases?: string[];
	/** Drawn only while this is true: Obsidian asks again each time it draws the tab. */
	visible?: boolean | (() => boolean);
	action?: never;
}

/** A toggle Obsidian draws and keeps in the plugin's settings itself. */
export interface ToggleRow extends Row { control: { type: 'toggle'; key: string; disabled?: () => boolean }; render?: never }

/** A dropdown Obsidian draws: its value is read and written through the tab's `getControlValue` and `setControlValue`. */
export interface DropdownRow extends Row { control: { type: 'dropdown'; key: string; options: Record<string, string> }; render?: never }

/** A row the tab draws itself. */
export interface RenderRow extends Row { render: (setting: Setting) => void; control?: never }

/** A row with nothing to change: a sentence said at the head of a page. */
export interface EmptyRow extends Row { control?: never; render?: never }

export type SettingRow = ToggleRow | DropdownRow | RenderRow | EmptyRow;

/** A row that opens a page of its own (Obsidian's "CSS snippets", "Excluded files"), with what is on it said at its end. */
export interface SettingPageRow {
	type: 'page';
	name: string;
	desc?: string;
	aliases?: string[];
	displayValue?: string | (() => string);
	items: SettingSection[];
}

/** A group of rows under a heading, or a list whose rows can be reordered, deleted and added to. */
export interface SettingSection {
	type: 'group' | 'list';
	heading?: string;
	cls?: string;
	items?: (SettingRow | SettingPageRow)[];
	emptyState?: string;
	onReorder?: (from: number, to: number) => void;
	onDelete?: (index: number) => void;
	addItem?: { name: string; action: (el: HTMLElement) => void };
	extraButtons?: ((b: ExtraButtonComponent) => unknown)[];
}
