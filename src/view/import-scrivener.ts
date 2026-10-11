import { ButtonComponent, Modal } from 'obsidian';
import type BindersPlugin from '../main';
import { MAX_BYTES, zipSource, type ProjectSource } from '../import/source';
import { readProject, type ReadProject } from '../import/scriv/project';
import { planImport } from '../import/scriv/plan';
import { buttonRow, cancelButton } from './modals';
import { ImportWindow, message, n, type ImportJob } from './import-window';

/* "Import from Scrivener": a Scrivener 3 project made into a new binder. Two dialogs, one after the other.
     - First one of Obsidian's small ones (here), to choose the project: its folder, through the system's dialog on a
       computer, or a zipped backup of it anywhere.
     - Then, with the project read, the shared second dialog (view/import-window.ts) over this file's job.
   Nothing is written until Import, and nothing but new files in a new folder then (import/vault.ts). The project is
   only ever read. It is offered in the command palette alone. */

/** What Scrivener's import is to the shared window: its two switches, and what it says of the Trash. */
function scrivenerJob(plugin: BindersPlugin, project: ReadProject): ImportJob {
	let research = true, snapshots = true;
	return {
		name: project.source.name,
		plan: (o) => planImport(project, { name: o.name, parent: o.parent, research, snapshots, settings: o.settings }),
		rows: (r) => {
			// (a switch for what the project doesn't have would switch nothing)
			if (project.roots.some((x) => x.type !== 'DraftFolder' && x.type !== 'TrashFolder' && x.children.length)) r.toggle('research', 'Research', research, (v) => { research = v; });
			if ([...project.source.files.keys()].some((p) => /^snapshots\/.+\.rtf$/i.test(p))) r.toggle('snapshots', 'Snapshots', snapshots, (v) => { snapshots = v; });
		},
		needs: (plan) => `${plan.trashCount ? `${n(plan.trashCount, 'document')} in Scrivener’s Trash ${plan.trashCount === 1 ? 'is' : 'are'} left out. ` : ''}The project itself isn’t changed.`,
		unchanged: () => project.source.unchanged(),
		checking: 'Checking the project…',
		changed: 'The project has changed since it was read. Close it in Scrivener and choose it again, or choose a zipped backup.',
		another: { label: 'Choose another project', row: 'Project', open: () => new ImportScrivenerModal(plugin).open() },
		caption: 'Italics, bold, links, footnotes, comments and pictures come across; fonts, sizes and colors stay in the original file, kept in Research/Originals.',
		empty: 'This project has no documents to bring in.',
	};
}

/** The first dialog: which project. */
export class ImportScrivenerModal extends Modal {
	private said!: HTMLElement;
	private buttons: ButtonComponent[] = [];
	private busy = false;

	constructor(private plugin: BindersPlugin) { super(plugin.app); }

	onOpen(): void {
		const host = this.plugin.importHost.desktop(this.app);
		this.setTitle('Import from Scrivener');
		this.modalEl.addClass('binders-import');
		this.contentEl.createEl('p', { text: 'Makes a new binder in this vault from a Scrivener 3 project. The project itself isn’t changed.' });
		// (where its folder can't be read, a phone above all, how to get the one file that can be chosen)
		if (!host) this.contentEl.createEl('p', { cls: 'binders-import-how', text: 'Choose a zipped backup of the project, as Scrivener’s own backup command makes one.' });
		this.said = this.contentEl.createDiv({ cls: 'binders-ask-error binders-import-said', attr: { role: 'status', 'aria-live': 'polite' } });
		const row = buttonRow(this);
		if (host) this.buttons.push(new ButtonComponent(row).setButtonText('Choose a project...').setCta().onClick(() => void this.folder()));
		const zip = new ButtonComponent(row).setButtonText('Choose a zipped backup...').onClick(() => this.zip());
		if (!host) zip.setCta();
		this.buttons.push(zip);
		cancelButton(row, this);
	}

	onClose(): void { this.contentEl.empty(); }

	/** What the dialog is doing, or why it couldn't: one line, under what it asks. */
	private say(doing: string | null, why = ''): void {
		this.busy = !!doing;
		this.said.setText(doing ?? why);
		this.said.toggleClass('is-doing', !!doing);
		for (const b of this.buttons) b.setDisabled(this.busy);
	}

	private async folder(): Promise<void> {
		const host = this.plugin.importHost.desktop(this.app);
		if (this.busy || !host) return;
		try {
			this.say(null);
			const path = await host.pick();
			if (path) await this.read(() => host.read(path));
		} catch (e) { this.say(null, message(e)); }
	}

	/** A zipped backup, through the browser's own file chooser: the one way there is on a phone. */
	private zip(): void {
		if (this.busy) return;
		const input = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.zip,application/zip', hidden: '' } });
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			input.remove();
			if (file) void this.read(async () => {
				if (file.size > MAX_BYTES) throw new Error('This backup is larger than the 256 MB import limit.');
				return zipSource(new Uint8Array(await file.arrayBuffer()), file.name);
			});
		}, { once: true });
		input.click();
	}

	/** The project read, and the second dialog opened on it. What can't be read is said here, and this one stays. */
	private async read(get: () => Promise<ProjectSource>): Promise<void> {
		if (this.busy) return;
		this.say('Reading the project…');
		try {
			// (a breath, so the words above are on screen before a long project is read)
			await new Promise((r) => window.setTimeout(r, 0));
			const project = readProject(await get());
			if (!this.contentEl.isConnected) return;
			this.close();
			new ImportWindow(this.plugin, scrivenerJob(this.plugin, project)).open();
		} catch (e) { this.say(null, message(e)); }
	}
}
