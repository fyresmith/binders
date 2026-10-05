import { MarkdownRenderChild, MarkdownRenderer, editorInfoField, type MarkdownPostProcessorContext, type TFile } from 'obsidian';
import { Compartment, Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { language, syntaxTree, type Language } from '@codemirror/language';
import type BindersPlugin from '../main';
import { forget, proseLanguage } from './language';
import { TABBED, tabsForRender } from './text';

/* Paragraphs as a book has them, in a binder's notes, wherever Obsidian shows one: a tab of its own, the manuscript
   (whose sections are Obsidian's editors), reading view, an embed, a hover preview. Two things, each with a setting:

   - Tab paragraphs (`tabParagraphs`): a line that starts with a tab is a paragraph that starts with a tab. Markdown
     reads such a line as code; here the editor is given a reading of it as prose (mode.ts, language.ts), reading view
     has the code block Obsidian made of it swapped for the paragraphs it is, and what Binders renders itself is
     given the text made ready (`forRender`). Links in such paragraphs follow a rename (rename.ts).
   - First-line indent (`indentParagraphs`): a paragraph that follows another starts a little in, as in print
     (first-line.ts for the editor, the stylesheet for reading view). Nothing is typed and nothing is in the file.

   Showing a note this way writes nothing. The one thing here that writes is rename.ts. */

/** Classes on the editor and on a rendered block, which the stylesheet goes by. */
const PROSE = 'binders-prose', TABS = 'binders-prose-tabs', INDENT = 'binders-prose-indent';
/** In reading view: a paragraph made from a tab line, the block of them, a run of them with no blank line between,
    the tab of a line inside a paragraph, and a block that is an embed and nothing else. */
const TAB_P = 'binders-tab-paragraph', TAB_BLOCK = 'binders-tab-paragraphs', RUN = 'binders-tab-run', TAB = 'binders-tab', EMBED = 'binders-embed-block';

/** What the plugin keeps of this. */
export interface Paragraphs {
	/** Every open editor follows the settings as they are now. */
	refresh(): void;
	/** A note's text made ready for `MarkdownRenderer.render`, which would make code of its tab paragraphs (and gives
	    a post-processor no way to tell): as it is, unless the note is in a binder and tab paragraphs are on. */
	forRender(text: string, path: string): string;
	/** For tests: the language an editor reads its text as, and one forgotten so it is looked at again. */
	languageOf(view: EditorView): Language | null;
	forget(lang: Language | null): void;
	/** For tests: how far into its text an editor has read (the whole length when it has read it all). */
	readTo(view: EditorView): number;
}

/** Sets up both. */
export function installParagraphs(plugin: BindersPlugin): Paragraphs {
	const slot = new Compartment();
	const fileOf = (state: EditorState): TFile | null => state.field(editorInfoField, false)?.file ?? null;
	const inBinder = (path: string | TFile | null): boolean => {
		const f = typeof path === 'string' ? plugin.app.vault.getAbstractFileByPath(path) : path;
		return !!f && !!plugin.binders?.binderOf(f);
	};
	/** What an editor on this note is given: as a key (to tell whether it has it already) and as extensions. */
	const wanted = (view: EditorView): [string, () => Extension] => {
		const s = plugin.settings, on = inBinder(fileOf(view.state));
		const tabs = on && s.tabParagraphs, indent = on && s.indentParagraphs;
		if (!tabs && !indent) return ['', () => []];
		return [`${tabs}${indent}`, () => {
			// (read while ours is out, or ours would be wrapped again)
			const lang = tabs ? proseLanguage(view.state.facet(language)) : null;
			return [
				lang ? Prec.highest(language.of(lang)) : [],
				EditorView.editorAttributes.of({ class: [PROSE, lang ? TABS : '', indent ? INDENT : ''].filter(Boolean).join(' ') }),
			];
		}];
	};
	const live = new Set<{ sync(force?: boolean): void }>();
	// An editor is given the reading only while the note it shows is in a binder: which note that is isn't known when
	// the extensions are built (one list for every editor), and an editor goes from note to note.
	const scope = ViewPlugin.fromClass(class {
		has = '';
		gone = false;
		pending = false;
		constructor(readonly view: EditorView) { live.add(this); this.sync(); }
		update() { this.sync(); }
		destroy() { this.gone = true; live.delete(this); }
		sync(force = false) {
			if (force) this.stale = true;
			if (this.pending || (!this.stale && wanted(this.view)[0] === this.has)) return;
			this.pending = true;
			// (not while the editor is in the middle of an update)
			queueMicrotask(() => {
				this.pending = false;
				if (this.gone) return;
				const [key] = wanted(this.view);
				if (key === this.has && !this.stale) return;
				this.stale = false;
				// first without ours, so the language read below is Obsidian's
				if (this.has) this.view.dispatch({ effects: slot.reconfigure([]) });
				const [, make] = wanted(this.view);
				this.has = key;
				if (key) this.view.dispatch({ effects: slot.reconfigure(make()) });
			});
		}
		/** What it has is to be made again whatever the settings say (a language forgotten). */
		stale = false;
	});
	plugin.registerEditorExtension([slot.of([]), scope]);

	// Reading view, and what else Obsidian renders a note in: an embed, a hover preview, a print to PDF
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const s = plugin.settings;
		if ((!s.tabParagraphs && !s.indentParagraphs) || !inBinder(ctx.sourcePath)) return;
		el.addClass(PROSE);
		if (s.indentParagraphs) {
			el.addClass(INDENT);
			// (a block that is an embed and nothing else isn't a paragraph for the one after it to follow)
			const p = el.querySelector(':scope > p');
			if (p && p.querySelector(':scope > .internal-embed, :scope > img') && !Array.from(p.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) el.addClass(EMBED);
		}
		if (s.tabParagraphs) return tabParagraphs(el, ctx, plugin);
	});

	return {
		refresh: () => { for (const v of live) v.sync(); },
		forRender: (text, path) => (plugin.settings.tabParagraphs && inBinder(path) ? tabsForRender(text) : text),
		languageOf: (view) => view.state.facet(language),
		forget: (lang) => { forget(lang); for (const v of live) v.sync(true); },
		readTo: (view) => syntaxTree(view.state).length,
	};
}

/** Reading view's part of tab paragraphs, a block at a time. A code block that Markdown made of lines starting with a
    tab is put back as the paragraphs they are: each line one, read as Markdown, so emphasis and links are there. (A
    fenced block is left alone.) And in a paragraph whose later lines start with a tab, those lines get their tab
    back: Markdown drops it. */
async function tabParagraphs(el: HTMLElement, ctx: MarkdownPostProcessorContext, plugin: BindersPlugin): Promise<void> {
	// which lines a block came from is in the source: without that (a renderer that doesn't say), it is left as it is
	const info = ctx.getSectionInfo(el);
	if (!info) return;
	const lines = info.text.split('\n').slice(info.lineStart, info.lineEnd + 1);
	const pre = el.querySelector(':scope > pre'), p = el.querySelector(':scope > p');
	if (pre) {
		if (!lines.length || !lines.every((l) => !l.trim() || TABBED.test(l))) return;
		// lines with no blank line between them are set as close as they are in the editor
		const runs: string[][] = [[]];
		for (const l of lines) { if (l.trim()) runs[runs.length - 1].push(l.trim()); else if (runs[runs.length - 1].length) runs.push([]); }
		const made: HTMLElement[] = [];
		// (what is rendered here lives as long as the block does)
		const child = new MarkdownRenderChild(el);
		ctx.addChild(child);
		for (const run of runs.filter((r) => r.length)) {
			const holder = createDiv({ cls: RUN });
			await MarkdownRenderer.render(plugin.app, run.join('\n\n'), holder, ctx.sourcePath, child);
			for (const c of Array.from(holder.children)) if (c.instanceOf(HTMLParagraphElement)) c.addClass(TAB_P);
			made.push(holder);
		}
		el.addClass(TAB_BLOCK);
		pre.replaceWith(...made);
	} else if (p && lines.slice(1).some((l) => TABBED.test(l))) {
		// (a line break each: only where the paragraph has one for every line, which is how Obsidian sets them unless
		// "Strict line breaks" is on, and then the lines run together and there is no line to indent)
		const breaks = Array.from(p.querySelectorAll(':scope > br'));
		if (breaks.length !== lines.length - 1) return;
		breaks.forEach((br, i) => {
			if (!TABBED.test(lines[i + 1])) return;
			// (the new line after the break would stand as a space after the tab)
			const next = br.nextSibling;
			if (next?.nodeType === Node.TEXT_NODE) next.textContent = (next.textContent ?? '').replace(/^\s+/, '');
			br.after(createSpan({ cls: TAB }));
		});
	}
}
