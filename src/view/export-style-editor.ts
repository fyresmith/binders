import { ButtonComponent, DropdownComponent, Menu, Notice, Platform, Setting, SliderComponent, setIcon } from 'obsidian';
import type BindersPlugin from '../main';
import type { Desktop } from '../export/desktop';
import { keyword, surname } from '../export/docx';
import type { ManuscriptStyle } from '../export/docx-parts';
import type { Book } from '../export/model';
import type { BookStyle } from '../export/style';
import { share } from '../export/export';
import { STYLE_EXT, type Resolved } from '../export/style-file';
import { GROUPS, PATTERN_MAX, type Family, type Row, type StyleValue } from '../export/style-rows';
import { configLook } from './internals';
import { confirm } from './modals';

/* The style editor: the Export window's sidebar while a style is being edited. Laid out as Obsidian's Bases lays out
   "Configure view" (a back arrow and a title, the style's name, groups of rows under a hairline, each row a label
   over a dropdown or a slider), with Obsidian's own controls. A change is kept as it is made, in the style's file
   (export/styles.ts): there is no Save. The rows are export/style-rows.ts; the design is docs/dev/export.md, "Styles".

   Bases' class names aren't in the API: `configLook` (internals.ts) says whether this Obsidian still has them, and
   without them the editor takes Binders' own rules for the same layout (`.binders-style-editor.is-plain`). */

export interface StyleEditorHost {
	plugin: BindersPlugin;
	family: Family;
	/** Whether the rows that are the pages' alone are shown: not from the Ebook kind, whose reader decides them. */
	pages: boolean;
	/** The style in hand, by name. */
	name(): string;
	/** Another style is in hand now (a duplicate was made, a style renamed, deleted or added). */
	choose(name: string): void;
	back(): void;
	/** A phone: to the preview. */
	preview?: () => void;
	desktop: Desktop | null;
}
export interface StyleEditor {
	el: HTMLElement;
	/** The style changed (here, or in its file), or another is in hand: what is shown follows it. */
	refresh(): void;
}

const OWN = '(own)';
const said = (r: Row, v: number): string => `${r.step && r.step < 0.1 ? v.toFixed(2) : String(v)}${r.unit ?? ''}`;

export function drawStyleEditor(side: HTMLElement, h: StyleEditorHost): StyleEditor {
	const { plugin } = h, styles = plugin.styles, style = (): Resolved => styles.get(h.name(), h.family);
	const tell = (e: unknown) => { new Notice(e instanceof Error ? e.message : typeof e === 'string' ? e : 'That couldn’t be done.'); };
	side.empty();
	const box = side.createDiv({ cls: 'modal-sidebar-inner binders-style-editor' });
	const head = box.createDiv({ cls: 'bases-toolbar-menu-container-header binders-style-head' });
	const back = head.createDiv({ cls: 'back-button', attr: { role: 'button', tabindex: '0', 'aria-label': 'Back to the choices', 'data-binders-key': 'style-back' } });
	setIcon(back.createDiv({ cls: 'back-icon' }), 'chevron-left');
	back.createDiv({ cls: 'back-label', text: 'Edit style' });
	press(back, () => h.back());
	const more = head.createDiv({ cls: 'clickable-icon binders-style-more', attr: { role: 'button', tabindex: '0', 'aria-label': 'More', 'aria-haspopup': 'menu', 'data-binders-key': 'style-more' } });
	setIcon(more, 'more-vertical');
	const form = box.createDiv({ cls: 'bases-toolbar-menu-form view-config-menu binders-style-form' });
	box.toggleClass('is-plain', !configLook(form));
	if (Platform.isPhone && h.preview) new ButtonComponent(box.createDiv({ cls: 'binders-export-phone-row binders-export-foot' })).setButtonText('Preview').onClick(() => h.preview?.());

	/** What each row shows, put right from the style as it is now. */
	const follow: (() => void)[] = [];
	let drawn = '';
	/** The writer asked for a heading of their own, and hasn't typed one yet. */
	let ownOpen = false;
	let renaming = false;

	const draw = () => {
		const r = style(), locked = r.state !== 'ok', top = form.scrollTop;
		drawn = `${r.name}\n${r.state}\n${String(r.values['chapter-heading'])}\n${String(r.values['scene-break'])}`;
		form.empty();
		follow.length = 0;
		// its name: a style of the writer's own is renamed here; a built-in one keeps its name
		const input = form.createDiv({ cls: 'input-row binders-style-name' }).createDiv({ cls: 'input-row-content' }).createEl('input', { type: 'text', attr: { spellcheck: 'false', placeholder: 'Style name', 'aria-label': r.builtIn ? 'Style name: a built-in style keeps its name' : 'Style name', 'data-binders-key': 'style-name' } });
		input.value = r.name;
		input.readOnly = r.builtIn;
		const rename = () => {
			const to = input.value.trim();
			// (leaving the field asks once: a second blur while the file is being renamed is not a second rename)
			if (!input.isConnected || renaming) return;
			if (r.builtIn || !to || to === r.name) { input.value = r.name; return; }
			renaming = true;
			void styles.rename(r, to).then((name) => { h.choose(name); }, (e) => { tell(e); input.value = r.name; }).finally(() => { renaming = false; });
		};
		input.addEventListener('blur', rename);
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input.blur(); } else if (e.key === 'Escape') { e.stopPropagation(); input.value = r.name; input.blur(); } });
		const note = form.createDiv({ cls: 'binders-style-note', attr: { role: 'status' } });
		const about = () => {
			const now = style();
			note.empty();
			if (now.state !== 'ok') { note.addClass('mod-warning'); note.createSpan({ text: now.warnings[0] ?? '' }); return; }
			const n = now.changes, changes = n ? ` · ${n} ${n === 1 ? 'change' : 'changes'}` : '';
			note.createSpan({ text: now.builtIn ? `Built in${changes}` : `Based on ${now.basedOn}` });
			if (now.builtIn && n) { const reset = note.createEl('a', { text: 'Reset', attr: { role: 'button', tabindex: '0', 'data-binders-key': 'style-reset' } }); press(reset, () => { try { styles.reset(style()); } catch (e) { tell(e); } ownOpen = false; draw(); form.querySelector<HTMLElement>('select')?.focus(); }); }
		};
		about();
		follow.push(about);
		for (const g of GROUPS[h.family]) {
			const rows = g.rows.filter((row) => h.pages || !row.pages);
			if (!rows.length) continue;
			const wrap = form.createDiv({ cls: 'input-group-container', attr: { role: 'group', 'aria-label': g.name } });
			wrap.createDiv({ cls: 'input-group-divider' });
			wrap.createDiv({ cls: 'input-group-header', text: g.name });
			const inside = wrap.createDiv({ cls: 'input-group-content' });
			for (const row of rows) control(inside, row, r, locked);
		}
		if (h.family === 'book' && !h.pages) form.createDiv({ cls: 'binders-style-note mod-foot', text: 'The typeface, the size and the pages are for the paperback: in an ebook the reader chooses them.' });
		form.scrollTop = top;
	};

	const set = (key: string, value: StyleValue) => { try { styles.set(style(), key, value); } catch (e) { tell(e); } };

	const control = (parent: HTMLElement, row: Row, r: Resolved, locked: boolean) => {
		const el = parent.createDiv({ cls: 'input-row', attr: { 'data-row': row.key } });
		el.createDiv({ cls: 'input-row-label', text: row.name });
		const content = el.createDiv({ cls: 'input-row-content' });
		const mark = () => el.toggleClass('is-changed', style().values[row.key] !== style().original[row.key]);
		follow.push(mark);
		mark();
		if (row.kind === 'slide') {
			const value = content.createSpan({ cls: 'slider-value' });
			const s = new SliderComponent(content).setLimits(row.min ?? 0, row.max ?? 1, row.step ?? 1).setInstant(true).setValue(Number(r.values[row.key])).setDisabled(locked);
			s.sliderEl.setAttrs({ 'aria-label': row.name, 'data-ignore-swipe': 'true', 'data-binders-key': `style-${row.key}` });
			s.sliderEl.disabled = locked;
		const say = (v: number) => { value.setText(said(row, v)); s.sliderEl.setAttr('aria-valuetext', said(row, v)); };
			say(Number(r.values[row.key]));
			s.onChange((v) => { say(v); set(row.key, v); });
			follow.push(() => { const v = Number(style().values[row.key]); if (s.getValue() !== v) { s.setValue(v); say(v); } });
			return;
		}
		const now = r.values[row.key], options = [...(row.options ?? [])], listed = options.findIndex(([v]) => v === now);
		const d = new DropdownComponent(content).setDisabled(locked);
		d.selectEl.setAttrs({ 'aria-label': row.name, 'data-binders-key': `style-${row.key}` });
		d.selectEl.disabled = locked;
		// (a mark of the writer's own, typed into the file, is offered as itself)
		if (row.kind === 'mark' && listed < 0) options.push([now, String(now)]);
		options.forEach(([, label], i) => { d.addOption(String(i), label); });
		if (row.kind === 'pattern') d.addOption(OWN, 'Your own...');
		const own = row.kind === 'pattern' && (listed < 0 || ownOpen);
		d.setValue(own ? OWN : String(options.findIndex(([v]) => v === now)));
		d.onChange((v) => {
			if (v === OWN) { ownOpen = true; draw(); form.querySelector<HTMLElement>('[data-binders-key="style-own-heading"]')?.focus(); return; }
			ownOpen = false;
			set(row.key, options[Number(v)][0]);
			if (own) { draw(); form.querySelector<HTMLElement>(`[data-binders-key="style-${row.key}"]`)?.focus(); }
		});
		follow.push(() => { const i = options.findIndex(([v]) => v === style().values[row.key]); if (i >= 0 && d.getValue() !== OWN && d.getValue() !== String(i)) d.setValue(String(i)); });
		if (!own) return;
		// the writer's own heading: the pattern itself, typed
		const mine = parent.createDiv({ cls: 'input-row binders-style-own' });
		mine.createDiv({ cls: 'input-row-label', text: 'Your own' });
		const text = mine.createDiv({ cls: 'input-row-content' }).createEl('input', { type: 'text', attr: { spellcheck: 'false', maxlength: String(PATTERN_MAX), 'aria-label': 'Your own heading', 'aria-describedby': 'binders-style-own-hint', 'data-binders-key': 'style-own-heading' } });
		text.value = String(now);
		text.disabled = locked;
		text.addEventListener('input', () => { if (text.value.trim()) set(row.key, text.value.trim()); });
		mine.createDiv({ cls: 'binders-style-note', text: '{number}, {number:words}, {number:roman} and {title}; a / starts a new line.', attr: { id: 'binders-style-own-hint' } });
	};

	const menu = () => {
		const r = style(), m = new Menu(), ok = r.state === 'ok', file = `${r.name}.${STYLE_EXT}`;
		m.addItem((i) => i.setTitle('Duplicate').setIcon('copy').setDisabled(!ok).onClick(() => void styles.duplicate(r).then((name) => { h.choose(name); form.querySelector<HTMLInputElement>('[data-binders-key="style-name"]')?.select(); }, tell)));
		if (!r.builtIn) m.addItem((i) => i.setTitle('Rename...').setIcon('pencil').onClick(() => { const input = form.querySelector<HTMLInputElement>('[data-binders-key="style-name"]'); input?.focus(); input?.select(); }));
		else m.addItem((i) => i.setTitle('Reset to the original').setIcon('rotate-ccw').setDisabled(!ok || !r.changes).onClick(() => { try { styles.reset(style()); } catch (e) { tell(e); } ownOpen = false; draw(); }));
		m.addSeparator();
		// (a built-in style with nothing changed is in every vault already: there is nothing to send)
		m.addItem((i) => i.setTitle(h.desktop ? 'Save a copy to share...' : 'Share this style...').setIcon('share').setDisabled(!ok || (r.builtIn && !r.hasFile)).onClick(() => void send(r, file).catch(tell)));
		m.addItem((i) => i.setTitle('Add a style from a file...').setIcon('file-input').onClick(() => pickFile()));
		const desk = h.desktop;
		if (desk) m.addItem((i) => i.setTitle('Show the style’s file').setIcon('folder-open').setDisabled(!r.hasFile).onClick(() => desk.reveal(desk.join(desk.base, ...styles.path(r.name).split('/')))));
		if (!r.builtIn) {
			m.addSeparator();
			m.addItem((i) => { i.setTitle('Delete').setIcon('trash-2').onClick(() => void remove(r).catch(tell)); (i as unknown as { setWarning?: (on: boolean) => void }).setWarning?.(true); });
		}
		const at = more.getBoundingClientRect();
		m.showAtPosition({ x: at.left, y: at.bottom + 4 });
	};
	press(more, menu);

	/** A copy to send to another writer: one that stands by itself, on a built-in style. */
	const send = async (r: Resolved, file: string) => {
		const data = new TextEncoder().encode(styles.shared(r.name, h.family)), desk = h.desktop;
		if (desk) {
			const to = await desk.pick(desk.join(desk.base, file), 'Binders export style', STYLE_EXT);
			if (!to) return;
			await desk.write(to, data);
			new Notice(`Saved a copy of “${r.name}” to ${to}.`);
		} else if (!(await share(data, file, 'text/plain'))) new Notice(r.hasFile ? `This style is the file ${styles.path(r.name)} in this vault.` : 'There is nowhere to share it to from here.');
	};
	const remove = async (r: Resolved) => {
		const used = plugin.binders.all().filter((b) => plugin.app.metadataCache.getFileCache(b.note)?.frontmatter?.[h.family === 'book' ? 'book-style' : 'manuscript-style'] === r.name).length;
		if (!(await confirm(plugin.app, { title: 'Delete this style', text: `“${r.name}” goes to the trash.${used ? ` ${used === 1 ? 'One binder uses' : `${used} binders use`} it, and will use ${r.basedOn} in its place.` : ''} Styles based on it keep how they look.`, cta: 'Delete', warning: true }))) return;
		const next = r.basedOn;
		await styles.remove(r);
		h.choose(next);
	};
	const pickFile = () => {
		const input = box.createEl('input', { type: 'file', cls: 'binders-style-file', attr: { accept: `.${STYLE_EXT}`, tabindex: '-1', 'aria-hidden': 'true' } });
		input.addEventListener('change', () => {
			const f = input.files?.[0];
			input.remove();
			if (f) void f.text().then((text) => styles.add(f.name, text)).then((name) => { h.choose(name); new Notice(`Added the style “${name}”.`); }, tell);
		});
		input.addEventListener('cancel', () => input.remove());
		input.click();
	};

	draw();
	return {
		el: box,
		refresh: () => {
			const r = style();
			if (!drawn.startsWith(`${r.name}\n${r.state}\n`)) { ownOpen = false; draw(); return; }
			// (a row that offers other things now is drawn again; anything else only takes its new value, so a slider being dragged is never replaced under the pointer)
			if (drawn !== `${r.name}\n${r.state}\n${String(r.values['chapter-heading'])}\n${String(r.values['scene-break'])}` && !form.contains(form.doc.activeElement)) draw();
			else for (const f of follow) f();
		},
	};
}

function press(el: HTMLElement, fn: () => void): void {
	el.addEventListener('click', fn);
	el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}

/** The window's Style row: the vault's styles of a family, and the way into the editor. A style whose file is a
    newer Binders', or can't be read, is listed and says so. */
export function styleRow(el: HTMLElement, plugin: BindersPlugin, family: Family, value: string, pick: (name: string) => void, edit: () => void): Setting {
	const row = new Setting(el).setName('Style').setClass('binders-export-style').addDropdown((d) => {
		for (const st of plugin.styles.list(family)) d.addOption(st.name, st.state === 'newer' ? `${st.name} (from a newer Binders)` : st.state === 'broken' ? `${st.name} (can’t be read)` : st.name);
		d.setValue(value).onChange(pick);
		d.selectEl.dataset.bindersKey = 'style';
	});
	row.addExtraButton((b) => {
		b.setIcon('sliders-horizontal').setTooltip('Edit this style').onClick(edit);
		b.extraSettingsEl.setAttrs({ role: 'button', tabindex: '0', 'aria-label': 'Edit this style', 'data-binders-key': 'edit-style' });
		b.extraSettingsEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } });
	});
	return row;
}

/** What the preview's drawing leaves to the style and doesn't set itself: said on the element the paper is drawn
    into, for styles.css. Returns the style, so it wraps the one handed to the drawing. */
export function dress<T extends BookStyle | ManuscriptStyle>(scroll: HTMLElement, style: T): T {
	if ('heading-size' in style) scroll.dataset.headingSize = style['heading-size'];
	return style;
}

/** A manuscript's running head, on the sheet the preview draws: once, at its top, as Word sets it on every page. */
export function runningHead(scroll: HTMLElement, book: Book, style: ManuscriptStyle): void {
	const paper = scroll.querySelector<HTMLElement>('.binders-export-paper');
	if (!paper || style.header === 'none') return;
	const said = style.header === 'page' ? '1' : [surname(book.author), keyword(book.title), '1'].filter((x) => x).join(' / ');
	// (over the first page of the text: a title page has none)
	const head = createDiv({ cls: 'binders-export-running', text: said, attr: { 'aria-label': `Along the top of each page: ${said}` } }), first = paper.querySelector('.binders-export-section:not(.binders-export-titlepage)');
	if (first) first.prepend(head); else paper.append(head);
}
