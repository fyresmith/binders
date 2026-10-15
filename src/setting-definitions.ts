import type { ExtraButtonComponent, Setting } from 'obsidian';

/* The parts of Obsidian 1.13's declarative settings that the settings tab uses, said here rather than imported from
   'obsidian': Obsidian's review checks a plugin against older typings that don't have them, and calls everything
   typed by them unsafe. They are the same shapes, so Obsidian's own types take them as they are. */

interface Row { name: string; desc?: string | DocumentFragment; action?: never }

/** A toggle Obsidian draws and keeps in the plugin's settings itself. */
export interface ToggleRow extends Row { control: { type: 'toggle'; key: string }; disabled?: () => boolean; render?: never }

/** A row the tab draws itself. */
export interface RenderRow extends Row { render: (setting: Setting) => void; control?: never }

export type SettingRow = ToggleRow | RenderRow;

/** A group of rows under a heading, or a list whose rows can be reordered, deleted and added to. */
export interface SettingSection {
	type: 'group' | 'list';
	heading?: string;
	cls?: string;
	items?: SettingRow[];
	emptyState?: string;
	onReorder?: (from: number, to: number) => void;
	onDelete?: (index: number) => void;
	addItem?: { name: string; action: (el: HTMLElement) => void };
	extraButtons?: ((b: ExtraButtonComponent) => unknown)[];
}
