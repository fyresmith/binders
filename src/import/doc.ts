/* The source document: what a reader of a word processor's file hands the importer, whatever the format. Paragraphs
   with the few things the importer asks of them (a style's name, an outline level, a page break, a list, a mark
   that a first line was set apart) and runs of text with the formatting that comes across. Revisions are settled by
   then, and a footnote is a paragraph list of its own. Pure. */

export type Run =
	| { kind: 'text'; text: string; b: boolean; i: boolean; s: boolean; href?: string }
	| { kind: 'br' }
	/** A footnote's mark: `note` is its index in `SourceDoc.notes`. */
	| { kind: 'note'; note: number }
	/** A picture kept: `index` is its place in `SourceDoc.pictures`. */
	| { kind: 'picture'; index: number }
	/** A comment from the margin, at the end of the words it is on: who wrote it, and what. */
	| { kind: 'comment'; text: string };

export interface Para {
	runs: Run[];
	/** The style's built-in name, lower case ("heading 1", "title", "normal"), never its id. */
	style: string;
	/** 0 to 8, directly or through the style chain. */
	outline: number | null;
	align: string | null;
	pageBefore: boolean;
	/** In twips. */
	indent: { first: number; left: number; right: number };
	list: { level: number; ordered: boolean } | null;
	/** It began with a tab the writer typed. */
	leadTab: boolean;
	toc: boolean;
	inTable: boolean;
	/** The file numbers it (a heading may then have no text). */
	numbered: boolean;
}

export interface SourceDoc {
	producer: string;
	paras: Para[];
	/** Footnotes, in the order of their marks (endnotes among them: said). */
	notes: Para[][];
	/** The pictures that are kept (PNG and JPEG): their bytes are inflated when asked for, and only then. */
	pictures: { ext: string; load(): Uint8Array | null }[];
	/** `underlined`: underlining is read as italics. `hasUnderline`, `hasItalic`: the file has some. */
	found: { revisions: number; comments: number; underlined: boolean; hasUnderline: boolean; hasItalic: boolean; headers: boolean; textBoxes: number; tables: number; pictures: number; otherPictures: number; endnotes: number };
	said: string[];
}
