import { MarkdownView, Notice, SuggestModal, TFile, TFolder, type TAbstractFile } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { BinderView } from '../view/BinderView';
import { LONGFORM } from './store';
import { quoted } from './tasks';

/* "Add revision task": Obsidian's own prompt (the quick switcher's, the command palette's), with one field. Under it,
   where a switcher lists notes, is what the task will be about: the scene in hand first, so Enter is all it takes,
   then the folders it is in and the whole book, for a task about more than the scene. What was selected in the scene
   is shown under the scene's name and kept with the task. With several notes selected in a view, the first row is
   one task about all of them (listed under each, counted once); there is no "one task each".

   It never touches the scene: nothing is written to its note or its editor, so what is typed and not saved yet stays
   in the editor, which keeps its text, selection and scroll; when the prompt closes the keyboard goes back to it. The
   one note written is the revision note (store.ts), and what is typed in its own tab is saved before that. */

interface About { items: TAbstractFile[]; name: string; kind: string; passage: string }

class CaptureModal extends SuggestModal<About> {
	constructor(private plugin: BindersPlugin, private binder: Binder, private rows: About[], private back: () => void) {
		super(plugin.app);
		const first = rows[0];
		this.setPlaceholder(first.items.length === 1 ? `Revision task for “${first.name}”` : first.items.length > 1 ? `Revision task for ${first.name}` : 'Revision task for the whole book');
		this.setInstructions([{ command: '↵', purpose: 'to add' }, ...(rows.length > 1 ? [{ command: '↑↓', purpose: 'to choose what it is about' }] : []), { command: 'esc', purpose: 'to dismiss' }]);
		this.modalEl.addClass('binders-revision-capture');
	}
	getSuggestions(): About[] { return this.rows; }
	renderSuggestion(a: About, el: HTMLElement): void {
		el.addClass('mod-complex');
		const c = el.createDiv({ cls: 'suggestion-content' });
		c.createDiv({ cls: 'suggestion-title', text: a.name });
		if (a.passage) c.createDiv({ cls: 'suggestion-note', text: `“${quoted(a.passage, 160)}”` });
		el.createDiv({ cls: 'suggestion-aux' }).createSpan({ cls: 'suggestion-flair binders-revision-kind', text: a.kind });
	}
	/** Enter with nothing typed adds nothing, and the prompt stays. */
	selectSuggestion(value: About, evt: MouseEvent | KeyboardEvent): void {
		if (!this.inputEl.value.trim()) return;
		super.selectSuggestion(value, evt);
	}
	onChooseSuggestion(a: About): void {
		const text = this.inputEl.value;
		void this.plugin.revision.add(this.binder, a.items, text, a.passage).then(() => { new Notice('Revision task added.', 2500); }, (e) => {
			// (what was typed isn't lost with the prompt: it is said, to be copied)
			new Notice(`The task couldn’t be added: ${e instanceof Error ? e.message : String(e)}\n\n${text}`, 0);
		});
	}
	onClose(): void {
		super.onClose();
		// (after Obsidian has put the focus where it thinks it was)
		window.setTimeout(this.back, 0);
	}
}

/** The binder the writer is in and what they have in hand there, for the command: the notes and folders selected in a
    binder view, the section with the cursor, the open note; or, in a binder's revision note, the binder with nothing. */
function context(plugin: BindersPlugin): { binder: Binder; items: TAbstractFile[] } | null {
	const t = plugin.inspect.target;
	if (t.binder) return { binder: t.binder, items: t.kind === 'items' ? t.items : [] };
	const file = plugin.app.workspace.getActiveFile(), binder = file ? plugin.binders.binderOf(file) : null;
	return file && binder && plugin.revision.is(file) ? { binder, items: [] } : null;
}

/** Opens the prompt for the scene the writer is in (or, from a menu, for `items` of `binder`). False if there is no
    binder to add to. A binder that can't be changed is said, and nothing opens. */
export function capture(plugin: BindersPlugin, checking = false, given?: { binder: Binder; items: TAbstractFile[] }): boolean {
	if (!given) plugin.inspect.look();
	const at = given ?? context(plugin);
	if (!at) return false;
	if (checking) return true;
	const { binder } = at, ws = plugin.app.workspace;
	if (binder.kind !== 'binder') { new Notice(LONGFORM, 8000); return true; }
	if (binder.problem) { new Notice(`This binder can’t be changed, so it takes no revision tasks. ${binder.problem}`, 8000); return true; }
	const items = at.items.filter((f) => f !== binder.folder);
	const one = items.length === 1 ? items[0] : null;
	// what is selected in the editor with the cursor, and that editor, to give the keyboard back to
	const view = plugin.inspect.target.view, md = ws.getActiveViewOfType(MarkdownView);
	let cm: EditorView | null = null, passage = '';
	if (!given && one instanceof TFile) {
		if (view instanceof BinderView && view.currentItem() === one) cm = view.currentEditor();
		if (cm) { const s = cm.state.selection.main; passage = s.empty ? '' : cm.state.sliceDoc(s.from, s.to); }
		else if (md?.file === one) passage = md.editor.getSelection();
	}
	const el = activeDocument.activeElement, was = el?.instanceOf(HTMLElement) ? el : null;
	const back = () => {
		if (given) return;
		if (cm && cm.dom.isConnected) cm.focus();
		else if (md && md.containerEl.isConnected && md.file && md.file === (one ?? md.file) && md.editor) md.editor.focus();
		else if (was?.isConnected) was.focus({ preventScroll: true });
	};
	const rows: About[] = [];
	if (items.length > 1) rows.push({ items, name: `${items.length} notes`, kind: 'Together', passage: '' });
	else if (one) {
		rows.push({ items: [one], name: one instanceof TFile ? one.basename : one.name, kind: one instanceof TFolder ? 'Folder' : one.parent && one.parent !== binder.folder ? one.parent.name : '', passage });
		for (let f = one.parent; f && f !== binder.folder && f.path.startsWith(binder.folder.path + '/'); f = f.parent) rows.push({ items: [f], name: f.name, kind: 'Folder', passage: '' });
	}
	rows.push({ items: [], name: binder.folder.name, kind: 'The whole book', passage: '' });
	new CaptureModal(plugin, binder, rows, back).open();
	return true;
}
