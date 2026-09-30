import { Modal, Setting, type App } from 'obsidian';

/* Small dialogs built from Obsidian's Modal and Setting, so they look like its own. Each resolves once it closes. */

/** Asks before something that can't be undone from here. Resolves true for the confirming button. */
export function confirm(app: App, o: { title: string; text: string; cta: string; warning?: boolean }): Promise<boolean> {
	return new Promise((resolve) => {
		let ok = false;
		const m = new Modal(app);
		m.setTitle(o.title);
		m.contentEl.createEl('p', { text: o.text });
		new Setting(m.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => m.close()))
			.addButton((b) => {
				b.setButtonText(o.cta).onClick(() => { ok = true; m.close(); });
				if (o.warning) b.buttonEl.addClass('mod-warning'); else b.setCta();
				window.setTimeout(() => b.buttonEl.focus(), 0); // Enter confirms, as in Obsidian's own dialogs
			});
		m.onClose = () => resolve(ok);
		m.open();
	});
}

/** Asks for a line of text. Resolves with it (trimmed), or null if cancelled or empty. */
export function ask(app: App, o: { title: string; placeholder: string; cta: string; value?: string }): Promise<string | null> {
	return new Promise((resolve) => {
		let value = o.value ?? '', ok = false;
		const m = new Modal(app);
		m.setTitle(o.title);
		const done = () => { ok = true; m.close(); };
		new Setting(m.contentEl).setClass('binders-ask').addText((t) => {
			t.setPlaceholder(o.placeholder).setValue(value).onChange((v) => { value = v; });
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
			window.setTimeout(() => t.inputEl.select(), 0);
		});
		new Setting(m.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => m.close()))
			.addButton((b) => b.setButtonText(o.cta).setCta().onClick(done));
		m.onClose = () => resolve(ok && value.trim() ? value.trim() : null);
		m.open();
	});
}
