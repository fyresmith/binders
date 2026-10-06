import { DEFAULT_LABELS, DEFAULT_STATUSES, readLabels, readStatuses, type LabelPreset } from './view/labels';
import { DEFAULT_COLUMNS, readColumns, type ColumnSpec } from './view/outliner-data';
import { COMPILE_DEFAULTS, type CompileOptions } from './scene-text';

/* Binders' settings as data: what they are, their defaults, and reading them back from what was saved. Pure (the
   settings tab is in settings.ts), so it can be unit-tested. */

/** Everything Binders keeps in its `data.json`. */
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
	/** The property that holds the writer's notes on a note or folder (never exported). */
	notesProp: string;
	/** The labels a note can have, in the order menus list them: a name and a color each. */
	labels: LabelPreset[];
	/** The statuses a note can have, in the order a draft goes through them. */
	statuses: string[];
	/** The outliner's columns as last arranged: what a newly opened outliner starts with. */
	outlinerColumns: ColumnSpec[];
	/** How export's "One note" was last set up. (These three keep the names they had when it was "Compile".) */
	compile: CompileOptions;
	/** What "One note" last wrote, by path (a fingerprint of the text): a note that's still as export left it is
	    replaced without asking; one that's been written in since, or was never an export, is asked about first. */
	compiled: Record<string, string>;
	/** Where each folder's one note last went (its path → the note's path): offered again the next time. */
	compiledTo: Record<string, string>;
	/** Export: the folder exported files go to. A name is a folder beside each binder; a path (with a `/`) is one
	    folder for the whole vault. */
	exportsFolder: string;
	/** Export: the folder at the top of the vault that holds the styles' files (kept out of the file explorer). */
	stylesFolder: string;
	/** Export: the author of a book that doesn't say otherwise, and the lines under the name on a manuscript's title
	    page (an address, an email, a phone number). */
	authorName: string;
	contact: string;
	/** Export: the kind last made, the manuscript style last used, and whether front and back matter went in. */
	exportKind: 'manuscript' | 'ebook' | 'paperback' | 'scrivener' | 'note';
	/** The manuscript's file (Word, or PDF on a computer) and the paper a PDF of it is on. */
	exportFile: 'docx' | 'pdf';
	exportPaper: string;
	exportStyle: string;
	exportMatter: boolean;
	/** A Scrivener project: notes outside the manuscript into Research, and snapshots carried across. */
	exportOutside: boolean;
	exportSnapshots: boolean;
	/** In a binder’s notes, a line that starts with a tab is shown as a paragraph that starts with one, not as code. */
	tabParagraphs: boolean;
	/** In a binder’s notes, a paragraph that follows another is shown with its first line indented. */
	indentParagraphs: boolean;
	/** The inspector's and the contents' tabs are put in the right sidebar whenever a binder view opens
	    (inspector/place.ts). Off: they are opened by their commands, and closed they stay closed. */
	sidePanes: boolean;
	/** Focus mode: the line being written at the end of a scene is held at one height. On to begin with, as dimming is. */
	focusTypewriter: boolean;
	/** Focus mode: where the scene is in the binder, and its synopsis, beside the text. */
	focusPlace: boolean;
	/** Focus mode: the scene's words and the words written today, in the corner. */
	focusNumbers: boolean;
	/** Focus mode: while typing, every paragraph but the one being written steps back. */
	focusDim: boolean;
	/** Focus mode: the page is a deep charcoal, with Obsidian's dark colors on it, whatever the theme. */
	focusDark: boolean;
	/** Focus mode: in a note, the end of the scene before and the start of the scene after, above and below its text. */
	focusNeighbours: boolean;
	/** Focus mode: the words to write in a day, or 0 for no goal. */
	focusGoal: number;
	/** Focus mode: the window goes to the system's fullscreen with it, and comes back out with it. */
	focusFullscreen: boolean;
	/** Word counts: a note's words as the exported book has them (comments out, a link's shown words only: the rule
	    is in docs/dev/plan.md), or, off, as Obsidian's status bar counts them. */
	bookWords: boolean;
}

/** What a new vault starts with. */
export const DEFAULT_SETTINGS: BindersSettings = {
	orderExplorer: true, openOnClick: true, hideBinderNotes: true, explorerLabels: true,
	synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', targetProp: 'target', notesProp: 'notes',
	labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES, outlinerColumns: DEFAULT_COLUMNS, compile: COMPILE_DEFAULTS, compiled: {}, compiledTo: {},
	exportsFolder: 'Exports', stylesFolder: 'Export styles', authorName: '', contact: '', exportKind: 'manuscript', exportFile: 'docx', exportPaper: 'letter', exportStyle: '', exportMatter: false, exportOutside: true, exportSnapshots: true,
	tabParagraphs: true, indentParagraphs: false, sidePanes: true,
	focusTypewriter: true, focusPlace: false, focusNumbers: false, focusDim: true, focusDark: true, focusNeighbours: false, focusGoal: 0, focusFullscreen: false,
	bookWords: true,
};

/** Focus mode's options that are on or off. */
export type FocusToggle = 'focusTypewriter' | 'focusNeighbours' | 'focusPlace' | 'focusNumbers' | 'focusDim' | 'focusDark' | 'focusFullscreen';
/** In the order the settings and the focus menu list them. */
export const FOCUS_TOGGLES: FocusToggle[] = ['focusTypewriter', 'focusNeighbours', 'focusPlace', 'focusNumbers', 'focusDim', 'focusDark', 'focusFullscreen'];
/** The ones this device can do: a phone or tablet has no window to put in fullscreen. */
export const focusToggles = (mobile: boolean): FocusToggle[] => FOCUS_TOGGLES.filter((k) => !mobile || k !== 'focusFullscreen');
/** The names and descriptions of focus mode's options, shared by the settings tab and focus mode's own menu. */
export const FOCUS_TEXT: Record<FocusToggle | 'focusGoal', readonly [string, string]> = {
	focusTypewriter: ['Typewriter scrolling', 'While you write at the end of a scene, the line you’re on stays at one height and the page moves under it. Anywhere else in the text, the page scrolls as it always does.'],
	focusNeighbours: ['Show the scenes before and after', 'In a note, the end of the scene before is shown above its text and the start of the scene after below it, as in the manuscript. Click one to go there.'],
	focusPlace: ['Show where you are', 'The scene’s place in the binder and its synopsis, beside the text. They go while you type.'],
	focusNumbers: ['Show word counts', 'The scene’s words, with its target, and the words written today in the binder. They go while you type and come back when you pause.'],
	focusDim: ['Dim other paragraphs', 'While you type, every paragraph but the one you’re in steps well back.'],
	focusDark: ['Dim the background', 'The page turns a deep charcoal while you’re in focus mode, with light text on it, in a light theme too.'],
	focusFullscreen: ['Enter fullscreen', 'Focus mode takes the whole screen, and gives it back when you leave.'],
	focusGoal: ['Words to write today', 'A goal for a day’s writing in a binder, shown with the word counts. Leave empty for none.'],
};

/** The word counts' one switch, as the settings tab says it. */
export const WORDS_TEXT: readonly [string, string] = ['Count words as the exported book does', 'Comments, the hidden part of a link and a note’s properties aren’t counted, so a card, a target and the toolbar say what an export of the binder says. Turn this off to count as Obsidian’s status bar does.'];

/** The sidebar's one switch, as the settings tab says it. */
export const SIDE_TEXT: readonly [string, string] = ['Show the inspector and contents with a binder', 'Opening a binder puts the inspector and the contents among the right sidebar’s tabs, if they aren’t there. Turn this off to open them yourself, and to keep them closed once you close them.'];

/** How paragraphs are shown in a binder’s notes (paragraphs/paragraphs.ts). */
export type ParagraphToggle = 'tabParagraphs' | 'indentParagraphs';
export const PARAGRAPH_TOGGLES: ParagraphToggle[] = ['tabParagraphs', 'indentParagraphs'];
export const PARAGRAPH_TEXT: Record<ParagraphToggle, readonly [string, string]> = {
	tabParagraphs: ['Start a paragraph with a tab', 'In a binder’s notes, a line that starts with a tab is shown as an indented paragraph. Obsidian shows such a line as code. The note keeps the tab you typed.'],
	indentParagraphs: ['Indent paragraphs', 'In a binder’s notes, the first line of a paragraph that follows another is indented, as in a printed book. Nothing is added to the note.'],
};

/** The file explorer’s four switches. */
export type Toggle = 'orderExplorer' | 'openOnClick' | 'hideBinderNotes' | 'explorerLabels';
/** The five property names settings can change. */
export type Prop = 'synopsisProp' | 'statusProp' | 'labelProp' | 'targetProp' | 'notesProp';
/** Both in the order the settings tab lists them. */
export const TOGGLES: Toggle[] = ['orderExplorer', 'openOnClick', 'hideBinderNotes', 'explorerLabels'];
export const PROPS: Prop[] = ['synopsisProp', 'statusProp', 'labelProp', 'targetProp', 'notesProp'];

/** Their names and descriptions in the settings tab. */
export const TEXT: Record<Toggle | Prop, readonly [string, string]> = {
	orderExplorer: ['Order binders in the file explorer', 'Show the notes and folders in a binder in its own order instead of by name, and drag them there to reorder. Turn this off if another plugin replaces the file explorer.'],
	openOnClick: ['Open binders from the file explorer', 'Clicking a binder, or a folder inside one, opens its binder view.'],
	hideBinderNotes: ['Hide binder and folder notes', 'Don’t list a binder’s own note, or a folder’s note named like it, in the file explorer. Clicking the folder opens them in the binder view.'],
	explorerLabels: ['Show label colors in the file explorer', 'A dot in its label’s color beside each labeled note and folder in a binder.'],
	synopsisProp: ['Synopsis', 'The property that holds a note’s card text.'],
	statusProp: ['Status', 'The property that holds a note’s status, such as draft or revised.'],
	labelProp: ['Label', 'The property that holds a note’s label.'],
	targetProp: ['Target', 'The property that holds a word count target: a note’s own, a folder’s, or the binder’s.'],
	notesProp: ['Notes', 'The property that holds your notes on a note or folder. They are never exported.'],
};

/** How many exported notes are remembered (the latest). */
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
	for (const k of ['folderHeadings', 'sceneHeadings', 'title', 'stripComments', 'stripTabs'] as const) if (typeof c[k] === 'boolean') s.compile[k] = c[k];
	if (typeof c.separator === 'string') s.compile.separator = c.separator;
	for (const k of FOCUS_TOGGLES) if (typeof d[k] === 'boolean') s[k] = d[k];
	for (const k of PARAGRAPH_TOGGLES) if (typeof d[k] === 'boolean') s[k] = d[k];
	if (typeof d.sidePanes === 'boolean') s.sidePanes = d.sidePanes;
	if (typeof d.bookWords === 'boolean') s.bookWords = d.bookWords;
	if (typeof d.focusGoal === 'number' && Number.isInteger(d.focusGoal) && d.focusGoal > 0) s.focusGoal = d.focusGoal;
	if (typeof d.exportsFolder === 'string' && d.exportsFolder.trim()) s.exportsFolder = d.exportsFolder.trim();
	if (typeof d.stylesFolder === 'string' && d.stylesFolder.trim() && !/[\\/]/.test(d.stylesFolder.trim())) s.stylesFolder = d.stylesFolder.trim();
	for (const k of ['authorName', 'contact', 'exportStyle'] as const) if (typeof d[k] === 'string') s[k] = d[k];
	if (d.exportKind === 'note' || d.exportKind === 'manuscript' || d.exportKind === 'ebook' || d.exportKind === 'paperback' || d.exportKind === 'scrivener') s.exportKind = d.exportKind;
	if (d.exportFile === 'docx' || d.exportFile === 'pdf') s.exportFile = d.exportFile;
	if (d.exportPaper === 'letter' || d.exportPaper === 'a4') s.exportPaper = d.exportPaper;
	s.exportOutside = d.exportOutside !== false;
	s.exportSnapshots = d.exportSnapshots !== false;
	if (typeof d.exportMatter === 'boolean') s.exportMatter = d.exportMatter;
	s.compiledTo = {};
	if (d.compiledTo && typeof d.compiledTo === 'object' && !Array.isArray(d.compiledTo)) for (const [k, v] of Object.entries(d.compiledTo).slice(-COMPILED_KEPT)) if (typeof v === 'string') s.compiledTo[k] = v;
	s.compiled = {};
	if (d.compiled && typeof d.compiled === 'object' && !Array.isArray(d.compiled)) for (const [k, v] of Object.entries(d.compiled).slice(-COMPILED_KEPT)) if (typeof v === 'string') s.compiled[k] = v;
	return s;
}
