import { ButtonComponent, Modal, Platform, setIcon } from 'obsidian';
import type BindersPlugin from '../main';
import type { Found, Keep } from './find-bar';

/* Replace all, shown before it is done: how many, in which notes (in the binder's order), and each change where it
   falls in its paragraph, as the snapshots dialog shows what changed in prose. Built from that dialog's parts. One
   filled button; closing the dialog replaces nothing. */

interface Ask { query: string; by: string; plan: Found[]; keep: Keep; count: number }

const n = (count: number, one: string, many = one + 's') => `${count.toLocaleString()} ${count === 1 ? one : many}`;

export function reviewReplace(plugin: BindersPlugin, ask: Ask): Promise<boolean> {
	return new Promise((resolve) => new ReviewModal(plugin, ask, resolve).open());
}

class ReviewModal extends Modal {
	private yes = false;
	constructor(private plugin: BindersPlugin, private ask: Ask, private resolve: (yes: boolean) => void) { super(plugin.app); }

	onOpen(): void {
		const { modalEl, contentEl, ask } = this, phone = Platform.isPhone;
		this.setTitle(ask.by ? `Replace “${ask.query}” with “${ask.by}”` : `Remove “${ask.query}”`);
		modalEl.addClass('binders-snapshots', 'binders-folder-snapshots', 'binders-find-review', 'mod-sync-history', 'mod-sidebar-layout');
		const side = createDiv({ cls: 'modal-sidebar mod-history binders-snapshots-side' });
		const inner = side.createDiv({ cls: 'modal-sidebar-inner' });
		inner.createDiv({ cls: 'binders-snapshots-head' }).createDiv({ cls: 'binders-snapshots-of', text: n(ask.plan.length, 'note') });
		const tree = inner.createDiv({ cls: 'binders-folder-snapshots-tree binders-find-review-tree', attr: { role: 'tree', 'aria-label': 'Notes that will change' } });
		const pane = createDiv({ cls: 'sync-history-content-container binders-snapshots-pane' });
		const content = pane.createDiv({ cls: 'sync-history-content' });
		const bar = content.createDiv({ cls: 'modal-setting-titlebar binders-snapshots-bar' });
		const title = bar.createDiv({ cls: 'modal-setting-title binders-snapshots-title' });
		const name = title.createSpan({ cls: 'binders-snapshots-name' });
		if (ask.by) { name.createEl('del', { text: ask.query }); name.appendText(' '); name.createEl('ins', { text: ask.by }); } else name.createEl('del', { text: ask.query });
		title.createSpan({ cls: 'binders-snapshots-detail', text: `${n(ask.count, 'place')} in ${n(ask.plan.length, 'note')}` });
		const actions = bar.createDiv({ cls: 'modal-setting-titlebar-actions' });
		new ButtonComponent(actions).setButtonText(ask.by ? 'Replace all' : 'Remove all').setCta().onClick(() => { this.yes = true; this.close(); });
		const body = content.createDiv({ cls: 'sync-history-preview binders-snapshots-text binders-folder-snapshots-body' });
		body.createDiv({ cls: 'binders-snapshots-key', text: `A snapshot of the ${ask.keep.of} is taken first. Nothing outside a note’s text is changed, and a link still leads where it led.` });

		// the notes in the binder's order, under the folders they are in (a folder is said once, as it starts)
		const root = ask.keep.root, heads = new Map<string, HTMLElement>();
		const folders = new Map<string, HTMLElement>([['', tree]]);
		const into = (dir: string): HTMLElement => {
			const had = folders.get(dir);
			if (had) return had;
			const up = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
			const item = into(up).createDiv({ cls: 'tree-item binders-folder-snapshots-row' });
			const self = item.createDiv({ cls: 'tree-item-self mod-collapsible', attr: { role: 'treeitem' } });
			setIcon(self.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'right-triangle');
			self.createDiv({ cls: 'tree-item-inner', text: dir.slice(dir.lastIndexOf('/') + 1) });
			const kids = item.createDiv({ cls: 'tree-item-children' });
			folders.set(dir, kids);
			return kids;
		};
		let shown = 0;
		for (const f of ask.plan) {
			const file = f.source.file;
			if (!file) continue;
			const dir = (file.parent?.path ?? '').slice(root.length + 1);
			const item = into(dir).createDiv({ cls: 'tree-item binders-folder-snapshots-row' });
			const self = item.createDiv({ cls: 'tree-item-self is-clickable', attr: { tabindex: '0', role: 'treeitem' } });
			self.createDiv({ cls: 'tree-item-inner', text: f.source.name });
			self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: f.hits.length.toLocaleString() });
			// (a long list of changes is drawn as far as a person reads before deciding; the rest is counted)
			if (shown > 400) continue;
			const head = body.createDiv({ cls: 'binders-find-review-note' });
			head.createSpan({ cls: 'binders-find-review-name', text: f.source.name });
			if (dir) head.createSpan({ cls: 'binders-find-review-in', text: dir.replace(/\//g, ' / ') });
			heads.set(file.path, head);
			const go = () => { head.scrollIntoView({ block: 'start' }); tree.querySelector('.is-active')?.removeClass('is-active'); self.addClass('is-active'); };
			self.addEventListener('click', go);
			self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
			const view = body.createDiv({ cls: 'binders-snapshots-changes' });
			let i = 0;
			while (i < f.hits.length) {
				const text = f.text, from = text.lastIndexOf('\n', f.hits[i].from - 1) + 1, nl = text.indexOf('\n', f.hits[i].to), to = nl < 0 ? text.length : nl;
				const p = view.createEl('p');
				let at = from;
				while (i < f.hits.length && f.hits[i].from < to) {
					const h = f.hits[i];
					p.appendText(text.slice(at, h.from));
					p.createEl('del', { text: text.slice(h.from, h.to) });
					if (ask.by) { p.appendText(' '); p.createEl('ins', { text: ask.by }); }
					at = h.to; i++; shown++;
				}
				p.appendText(text.slice(at, to));
			}
		}
		if (shown < ask.count) body.createDiv({ cls: 'diff-collapsed binders-snapshots-folded', text: `and ${n(ask.count - shown, 'more place')}` });
		if (!phone) contentEl.appendChild(side);
		contentEl.appendChild(pane);
	}

	onClose(): void { this.contentEl.empty(); this.resolve(this.yes); }
}
