import { setIcon } from 'obsidian';
import type { Book, OutlineRow } from '../export/model';

/* "Contents" in the Export window: the pages Binders makes for the book, then every item of the binder with the role
   it was given. A role Binders read from the binder's shape is said more quietly than one written by hand. A row
   opens its note; the role at its end (and the row's own menu) is "Export as": the same choices as everywhere else
   (view/export-as.ts). Drawn with Obsidian's own tree classes, with `createEl` only. */

const ROLE: Record<string, string> = { part: 'Part', chapter: 'Chapter', scene: 'Scene', front: 'Front matter', back: 'Back matter', out: 'Left out', group: '' };
const MADE: Record<string, string> = { 'title-page': 'Title page', copyright: 'Copyright', contents: 'Contents' };
/** A role as "Contents" says it. */
export const roleName = (r: OutlineRow): string => `${ROLE[r.role] ?? ''}${r.number != null ? ` ${r.number}` : ''}`;

export interface ContentsHost {
	/** Opens a note of the binder (and closes the window). */
	open(path: string): void;
	/** "Export as" for the item at a path, as a menu at `at` (an element to hang it under, or where the pointer is).
	    Absent where roles can't be overruled (a Longform project, a binder that can't be written). */
	menu?: (path: string, at: HTMLElement | MouseEvent) => void;
}

export function drawContents(el: HTMLElement, book: Book, h: ContentsHost): void {
	el.empty();
	el.setAttrs({ role: 'list', 'aria-label': 'Contents' });
	// the pages Binders makes: listed so the book is whole here, with nothing to open or overrule
	for (const s of book.sections) {
		if (!s.made || !MADE[s.matter ?? '']) continue;
		const row = el.createDiv({ cls: 'tree-item nav-file', attr: { role: 'listitem' } });
		const self = row.createDiv({ cls: 'tree-item-self nav-file-title binders-export-row binders-export-made', attr: { 'aria-label': `${MADE[s.matter ?? '']}, made for the book` } });
		self.setCssProps({ '--binders-export-depth': '0' });
		self.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: MADE[s.matter ?? ''] });
	}
	if (!book.outline.length) el.createDiv({ cls: 'binders-export-none', text: 'Nothing here is exported.' });
	for (const r of book.outline) {
		const role = roleName(r), auto = r.role !== 'out' && !r.said;
		const row = el.createDiv({ cls: 'tree-item nav-file', attr: { role: 'listitem' } });
		const self = row.createDiv({ cls: 'tree-item-self nav-file-title binders-export-row', attr: { 'data-path': r.path } });
		self.setCssProps({ '--binders-export-depth': String(r.depth) });
		self.toggleClass('binders-export-out', r.role === 'out');
		const name = self.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: r.name });
		if (!r.folder) {
			// (the name is the way to the note; the row is clicked anywhere for it)
			self.addClass('is-clickable');
			name.setAttrs({ role: 'button', tabindex: '0', 'aria-label': `${r.name}: open the note` });
			self.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.binders-export-role')) h.open(r.path); });
			name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.open(r.path); } });
		}
		const menu = h.menu;
		if (!menu) { if (role) self.createDiv({ cls: `nav-file-tag binders-export-role${auto ? ' is-auto' : ''}`, text: role }); continue; }
		// its role, which is also the way to overrule it. A folder that only groups has no role to say: the menu is there all the same
		const said = role || 'Group';
		const tag = self.createDiv({ cls: `nav-file-tag binders-export-role is-menu${auto ? ' is-auto' : ''}${role ? '' : ' is-none'}`, attr: { role: 'button', tabindex: '0', 'aria-haspopup': 'menu', 'aria-label': `${r.name}: export as ${said.toLowerCase()}${auto ? ', automatic' : ''}. Change` } });
		tag.createSpan({ text: said });
		setIcon(tag.createSpan({ cls: 'binders-export-role-icon' }), 'chevrons-up-down');
		tag.addEventListener('click', (e) => { e.stopPropagation(); menu(r.path, tag); });
		tag.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); menu(r.path, tag); } });
		self.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(r.path, e); });
	}
}
