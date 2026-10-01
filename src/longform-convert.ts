import { ButtonComponent, Modal, Notice, Setting, type App } from 'obsidian';
import type { Binder, BinderStore } from './binders';
import { longformRunning } from './longform';

/* "Convert to binder" for a Longform project: says what will happen, with two choices, and does it on confirm. */
export class ConvertModal extends Modal {
	private folders = false;
	private removeLongform = false;
	private summaryEl: HTMLElement;
	private convertBtn: HTMLButtonElement | null = null;

	constructor(app: App, private store: BinderStore, private binder: Binder, private done: () => void = () => {}) { super(app); }

	onOpen(): void {
		const { contentEl } = this, name = this.binder.folder.name;
		this.setTitle('Convert to binder');
		contentEl.createEl('p', { text: `“${name}” is a Longform project. As a binder, it keeps its own order in a binder note, and can have subfolders.` });
		new Setting(contentEl).setName('Move groups into folders')
			.setDesc('Scenes indented under another scene move into a folder named after it. Links to them are updated.')
			.addToggle((t) => t.setValue(this.folders).onChange((v) => { this.folders = v; this.update(); }));
		new Setting(contentEl).setName('Remove the “longform” property')
			.setDesc('Longform will no longer see this project. If it stays, it keeps an order of its own that changes made here don’t update.')
			.addToggle((t) => t.setValue(this.removeLongform).onChange((v) => { this.removeLongform = v; this.update(); }));
		contentEl.createEl('p', { text: 'What will happen:' });
		this.summaryEl = contentEl.createEl('ul');
		const row = contentEl.createDiv({ cls: 'modal-button-container' });
		this.convertBtn = new ButtonComponent(row).setButtonText('Convert').setCta().onClick(() => void this.convert()).buttonEl;
		new ButtonComponent(row).setButtonText('Cancel').onClick(() => this.close());
		this.update();
	}

	private update(): void {
		const el = this.summaryEl, plan = this.store.conversion(this.binder, this.folders);
		el.empty();
		const li = (text: string) => el.createEl('li', { text });
		if (plan.problem) li(plan.problem);
		li(plan.creates ? `A binder note, “${plan.note}”, is created with the order.` : `“${this.binder.note.basename}” becomes the binder note and gets the order in a “contents” property.`);
		const n = plan.contents.filter((c) => !c.endsWith('/')).length;
		li(`${n} ${n === 1 ? 'note keeps its' : 'notes keep their'} place. No text changes.`);
		for (const f of plan.folders) {
			const moved = plan.moves.filter((m) => m.to.split('/').slice(-2, -1)[0] === f).length;
			li(`“${f}” is a new folder, and ${moved} ${moved === 1 ? 'note moves' : 'notes move'} into it.`);
		}
		if (plan.joins.length) li(`Also shown in the binder: ${plan.joins.map((j) => `“${j.replace(/\/$/, '')}”`).join(', ')}.`);
		if (this.removeLongform) li(`The “longform” property is removed from “${this.binder.note.basename}”.`);
		else {
			li('Longform’s own properties stay, so Longform still lists the project.');
			if (plan.moves.length && longformRunning(this.app)) li('Longform will drop the moved notes from its list.');
		}
		this.convertBtn?.toggleAttribute('disabled', !!plan.problem);
	}

	private async convert(): Promise<void> {
		this.convertBtn?.setAttribute('disabled', '');
		try {
			await this.store.convertToBinder(this.binder, { folders: this.folders, removeLongform: this.removeLongform });
			new Notice(`“${this.binder.folder.name}” is now a binder.`);
			this.close();
			this.done();
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
			this.convertBtn?.removeAttribute('disabled');
		}
	}

	onClose(): void { this.contentEl.empty(); }
}
