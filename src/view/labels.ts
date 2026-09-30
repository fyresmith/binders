/* Labels are plain text in a note's properties. The names of Obsidian's accent colors show in that color (through its
   --color-* variables, so every theme sets them); anything else gets a neutral color. */

export const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type LabelColor = typeof LABEL_COLORS[number] | 'other';

/** The color a label shows in, or null for no label. */
export function labelColor(label: string): LabelColor | null {
	const l = label.trim().toLowerCase();
	if (!l) return null;
	return (LABEL_COLORS as readonly string[]).includes(l) ? l as LabelColor : 'other';
}

/** Sentence case for a label or status shown in a menu ("red" → "Red"), leaving the stored text as it is. */
export const display = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A small colored dot for a label, as shown in menus and on headings. */
export function labelDot(parent: DocumentFragment | HTMLElement, label: string): HTMLElement {
	return parent.createSpan({ cls: `binders-label-dot mod-${labelColor(label) ?? 'none'}` });
}
