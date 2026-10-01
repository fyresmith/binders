import { DEFAULT_LABELS, DEFAULT_STATUSES, readLabels, readStatuses, type LabelPreset } from './view/labels';
import { DEFAULT_COLUMNS, readColumns, type ColumnSpec } from './view/outliner-data';
import { COMPILE_DEFAULTS, type CompileOptions } from './scene-text';

/* Binders' settings as data: what they are, their defaults, and reading them back from what was saved. Pure (the
   settings tab is in settings.ts), so it can be unit-tested. */

export interface BindersSettings {
	/** Show binders in their own order in Obsidian's file explorer (patches the explorer's sorting). */
	orderExplorer: boolean;
	/** Clicking a binder, or a folder inside one, in the file explorer opens its binder view. */
	openOnClick: boolean;
	/** Hide binder notes and folder notes in the file explorer (clicking the folder opens them in the binder view). */
	hideBinderNotes: boolean;
	/** Show each note's label color beside its name in the file explorer. */
	explorerLabels: boolean;
	/** The property names scenes use; changeable so Binders can share a vault's existing names. */
	synopsisProp: string;
	statusProp: string;
	labelProp: string;
	targetProp: string;
	/** The labels a note can have, in the order menus list them: a name and a color each. */
	labels: LabelPreset[];
	/** The statuses a note can have, in the order a draft goes through them. */
	statuses: string[];
	/** The outliner's columns as last arranged: what a newly opened outliner starts with. */
	outlinerColumns: ColumnSpec[];
	/** How "Compile" was last set up. */
	compile: CompileOptions;
	/** What "Compile" last wrote, by path (a fingerprint of the text): a note that's still as Compile left it is
	    replaced without asking; one that's been written in since, or was never a compile, is asked about first. */
	compiled: Record<string, string>;
}

export const DEFAULT_SETTINGS: BindersSettings = {
	orderExplorer: true, openOnClick: true, hideBinderNotes: true, explorerLabels: true,
	synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', targetProp: 'target',
	labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES, outlinerColumns: DEFAULT_COLUMNS, compile: COMPILE_DEFAULTS, compiled: {},
};

export type Toggle = 'orderExplorer' | 'openOnClick' | 'hideBinderNotes' | 'explorerLabels';
export type Prop = 'synopsisProp' | 'statusProp' | 'labelProp' | 'targetProp';
export const TOGGLES: Toggle[] = ['orderExplorer', 'openOnClick', 'hideBinderNotes', 'explorerLabels'];
export const PROPS: Prop[] = ['synopsisProp', 'statusProp', 'labelProp', 'targetProp'];

export const TEXT: Record<Toggle | Prop, readonly [string, string]> = {
	orderExplorer: ['Order binders in the file explorer', 'Show the notes and folders in a binder in its own order instead of by name, and drag them there to reorder. Turn this off if another plugin replaces the file explorer.'],
	openOnClick: ['Open binders from the file explorer', 'Clicking a binder, or a folder inside one, opens its binder view.'],
	hideBinderNotes: ['Hide binder and folder notes', 'Don’t list a binder’s own note, or a folder’s note named like it, in the file explorer. Clicking the folder opens them in the binder view.'],
	explorerLabels: ['Show label colors in the file explorer', 'A dot in its label’s color beside each labeled note and folder in a binder.'],
	synopsisProp: ['Synopsis', 'The property that holds a note’s card text.'],
	statusProp: ['Status', 'The property that holds a note’s status, such as draft or revised.'],
	labelProp: ['Label', 'The property that holds a note’s label.'],
	targetProp: ['Target', 'The property that holds a word count target: a note’s own, a folder’s, or the binder’s.'],
};

/** How many compiled notes are remembered (the latest). */
export const COMPILED_KEPT = 30;

/** Settings as saved, made whole: defaults for what's missing, and lists that aren't well formed put right. */
export function readSettings(data: unknown): BindersSettings {
	const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	const s: BindersSettings = { ...DEFAULT_SETTINGS };
	for (const k of TOGGLES) if (typeof d[k] === 'boolean') s[k] = d[k];
	for (const k of PROPS) { const v = d[k]; if (typeof v === 'string' && v.trim()) s[k] = v.trim(); }
	s.labels = (readLabels(d.labels) ?? DEFAULT_LABELS).map((l) => ({ ...l }));
	s.statuses = [...(readStatuses(d.statuses) ?? DEFAULT_STATUSES)];
	s.outlinerColumns = (readColumns(d.outlinerColumns) ?? DEFAULT_COLUMNS).map((c) => ({ ...c }));
	const c = (d.compile && typeof d.compile === 'object' ? d.compile : {}) as Record<string, unknown>;
	s.compile = { ...COMPILE_DEFAULTS };
	for (const k of ['folderHeadings', 'sceneHeadings', 'title', 'stripComments'] as const) if (typeof c[k] === 'boolean') s.compile[k] = c[k];
	if (typeof c.separator === 'string') s.compile.separator = c.separator;
	s.compiled = {};
	if (d.compiled && typeof d.compiled === 'object' && !Array.isArray(d.compiled)) for (const [k, v] of Object.entries(d.compiled).slice(-COMPILED_KEPT)) if (typeof v === 'string') s.compiled[k] = v;
	return s;
}
