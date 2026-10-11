/* The source document: what a reader of a word processor's file hands the importer, whatever the format. Paragraphs
   with the few things the importer asks of them (a style's name, an outline level, a page break, a list, a mark
   that a first line was set apart) and runs of text with the formatting that comes across. Revisions are settled by
   then, and a footnote is a paragraph list of its own. Pure. */

export type Run =
	| { kind: 'text'; text: string; b: boolean; i: boolean; s: boolean; href?: string }
	| { kind: 'br' }
	/** A footnote's mark: `note` is its index in `SourceDoc.notes`. */
	| { kind: 'note'; note: number }
	| { kind: 'picture' };

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
}

export interface SourceDoc {
	producer: string;
	paras: Para[];
	/** Footnotes, in the order of their marks (endnotes among them: said). */
	notes: Para[][];
	found: { revisions: number; comments: number; underlined: boolean; headers: boolean; textBoxes: number; tables: number; pictures: number; endnotes: number };
	said: string[];
}
