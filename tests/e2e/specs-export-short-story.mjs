// Export, a short story (docs/export-manuscript.md): a binder of loose notes under "Folders are chapters, notes are
// scenes" is one chapter, and the Short story style sets it as a short story's manuscript has it: no page for the
// title, the writer's name and the count at the top of the first page, the title a few lines down, and the story
// beginning under it. Read as a writer would see it, in the window's pages and in the PDF that is printed.
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { strFromU8, unzipSync } from 'fflate';
import { join } from 'path';
import { PL, j, openView, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const WIN = '.modal.binders-export';
const FRAME = `document.querySelector('${WIN} iframe.binders-export-frame')`;
const hasText = !spawnSync('pdftotext', ['-v']).error;

const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const choose = async (p, key, value) => { await p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change')); return 1; })()`); await p.sleep(300); };
const laidOut = (p, ms = 20000) => until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]') && !!${FRAME}`, ms);
const pages = (p) => p.ev(`(() => { const d = ${FRAME}?.contentDocument; if (!d) return []; return [...d.querySelectorAll('.page')].map(live => { const pg = live.cloneNode(true); for (const b of pg.querySelectorAll('br')) b.replaceWith('\\n'); return { cls: pg.className, text: [...(pg.querySelector('.text')?.children ?? [])].map(c => c.textContent).join('\\n'), head: pg.querySelector('.head')?.textContent ?? '' }; }); })()`);
const press = (p, label) => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (b) b.click(); return !!b; })()`);
const saved = (p, ms = 60000) => until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, ms);
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); } };

/** The save dialog stood in for (it takes the folder it is offered), as in specs-export-pdf.mjs. */
const standIn = (p) => p.ev(`(() => {
	const pl = ${PL}; window.__bp ??= { desktop: pl.exportHost.desktop, printer: pl.exportHost.printer };
	pl.exportHost.desktop = (app) => { const d = window.__bp.desktop(app); return d && { ...d, pick: async (start) => start }; };
	return 1;
})()`);

/** A story of two notes, a few pages long, in a binder of its own. */
const makeStory = (p) => p.ev(`(async () => {
	const pl = ${PL}; pl.settings.authorName = 'Mara Lindqvist'; pl.settings.contact = '12 Harbour Row'; await pl.saveData(pl.settings);
	const para = (seed) => Array.from({ length: 160 }, (_, i) => seed + i).join(' ') + '.';
	await app.vault.createFolder('Salt');
	await app.vault.create('Salt/One.md', 'The sea was flat. ' + [para('a'), para('b'), para('c'), para('d')].join('\\n\\n') + '\\n');
	await app.vault.create('Salt/Two.md', 'Then the wind came. ' + [para('e'), para('f'), para('g'), para('h')].join('\\n\\n') + '\\n');
	await app.vault.create('Salt/Salt.md', '---\\nbinder: 1\\ntitle: Salt\\nstructure: chapters and scenes\\ncontents:\\n  - One\\n  - Two\\n---\\n');
	return 1;
})()`);

specs.push({
	name: 'export short story: loose notes are one chapter, and the Short story style puts the title on the first page with the story under it, in the window and in the PDF',
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
		await standIn(p);
		await makeStory(p);
		await until(p, `!!${PL}.binders.binderOf('Salt')`, 8000);
		try {
			await openView(p, 'Salt');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(150);
			await choose(p, 'file', 'pdf');
			await choose(p, 'style', 'Short story');
			t.ok(await laidOut(p), 'the pages are laid out');
			const shown = await pages(p);
			t.ok(shown.length >= 3, `the story runs over several pages (${shown.length})`);
			const first = shown[0].text;
			t.ok(!/title-page/.test(shown[0].cls), 'there is no page of its own for the title');
			t.ok(first.indexOf('Mara Lindqvist') >= 0 && first.indexOf('Mara Lindqvist') < first.indexOf('about 1,300 words') && first.indexOf('about 1,300 words') < first.indexOf('Salt') && first.indexOf('Salt') < first.indexOf('The sea was flat.'), 'the first page has the name and the count, then the title, then the story');
			t.ok(first.includes('a0 a1 a2'), 'and the story goes on under the title on that page, not at the top of the next');
			t.ok(!shown.some((s) => /Chapter/.test(s.text)), 'a story of one chapter has no chapter heading');
			t.ok(shown.some((s) => s.text.split('\n').includes('#')), 'the two notes are parted by a scene break');
			t.eq(shown[0].head, '', 'no header on the first page');
			t.eq(shown[1].head, 'Lindqvist / SALT / 2', 'the second page says 2: the first was counted');

			await press(p, 'Export');
			t.ok(await saved(p), 'the bar says it was saved');
			const at = join(p.vaultDir, 'Exports', 'Salt.pdf');
			t.ok(existsSync(at), 'a PDF, in Exports');
			if (process.env.BINDERS_KEEP_PDF) { mkdirSync(process.env.BINDERS_KEEP_PDF, { recursive: true }); copyFileSync(at, join(process.env.BINDERS_KEEP_PDF, 'short-story.pdf')); }
			if (!hasText) console.log('\n    !! pdftotext isn’t installed (Poppler): the printed pages were not read, not passed\n');
			else {
				const printed = spawnSync('pdftotext', ['-enc', 'UTF-8', at, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\f').slice(0, -1);
				t.eq(printed.length, shown.length, 'the printed pages are the window’s: as many');
				t.ok(printed[0].includes('about 1,300 words') && printed[0].includes('SALT') && printed[0].includes('The sea was flat.') && printed[0].includes('a0 a1'), 'the printed first page has the count, the title and the start of the story');
				t.ok(!printed[0].includes('LINDQVIST') && printed[1].includes('Lindqvist / SALT / 2'), 'and no header on it, “2” on the next');
			}

			// the same story as a Word file: the preview, and the file that is made
			await choose(p, 'file', 'docx');
			await until(p, `!!document.querySelector('${WIN} .binders-export-paper .mod-opening')`, 8000);
			t.eq(await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-paper .mod-opening'); return [!!s.querySelector('.binders-export-title'), !!s.querySelector('.binders-export-heading'), !!document.querySelector('${WIN} .binders-export-titlepage')].join(); })()`), 'true,false,false', 'the preview has the title at the top of the story, no heading over it and no page of its own');
			await press(p, 'Export');
			t.ok(await saved(p), 'the Word file was saved');
			const docx = strFromU8(unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'Salt.docx'))))['word/document.xml']);
			t.ok(docx.indexOf('>Salt<') > 0 && docx.indexOf('>Salt<') < docx.indexOf('The sea was flat.') && !docx.slice(0, docx.indexOf('The sea was flat.')).includes('<w:sectPr>') && !docx.includes('w:val="Heading1"'), 'and the file has the title and the story on the first page, with no chapter heading');
		} finally {
			await closeAll(p);
			await p.ev(`(async () => { const pl = ${PL}; if (window.__bp) { pl.exportHost.desktop = window.__bp.desktop; pl.exportHost.printer = window.__bp.printer; } Object.assign(pl.settings, { exportKind: 'manuscript', exportStyle: '' }); await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); const f = app.vault.getAbstractFileByPath('Salt'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
		}
	}),
});

/** A style of the writer's own, in the styles folder, and taken away again. */
const withStyle = async (p, name, text) => {
	await p.ev(`(async () => { await app.vault.adapter.mkdir('Export styles').catch(() => {}); await app.vault.adapter.write('Export styles/${name}.bookstyle', ${j(text)}); })().then(() => 1)`);
	await until(p, `${PL}.styles.text(${j(name)}) === ${j(text)}`, 8000);
};
const dropStyles = (p) => p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Export styles'); if (f) await app.vault.delete(f, true); await ${PL}.styles.reload(); })().then(() => 1)`);

specs.push({
	name: 'export short story: a style can leave the “by” line out from under the title, in the window’s pages, its Word preview and the Word file',
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
		await standIn(p);
		await makeStory(p);
		await withStyle(p, 'No by', '---\nexport-style: 1\nbased-on: Short story\nby-line: false\n---\n');
		await until(p, `!!${PL}.binders.binderOf('Salt')`, 8000);
		try {
			await openView(p, 'Salt');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(150);
			await choose(p, 'file', 'pdf');
			await choose(p, 'style', 'Short story');
			t.ok(await laidOut(p), 'the pages are laid out');
			t.ok((await pages(p))[0].text.includes('by Mara Lindqvist'), 'the Short story style keeps “by Mara Lindqvist” under the title');
			await choose(p, 'style', 'No by');
			t.ok(await laidOut(p), 'laid out again');
			const first = (await pages(p))[0].text;
			t.ok(!first.includes('by Mara') && first.includes('Salt') && first.includes('The sea was flat.'), 'a style with the by-line off: no “by” line, the title and the story are still there');
			await choose(p, 'file', 'docx');
			await until(p, `!!document.querySelector('${WIN} .binders-export-paper .mod-opening')`, 8000);
			t.eq(await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-paper .mod-opening'); return [!!s.querySelector('.binders-export-title'), !!s.querySelector('.binders-export-by')].join(); })()`), 'true,false', 'the Word preview has the title and no “by” line');
			await press(p, 'Export');
			t.ok(await saved(p), 'the Word file was saved');
			const docx = strFromU8(unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'Salt.docx'))))['word/document.xml']);
			t.ok(docx.includes('>Salt<') && !docx.includes('by Mara Lindqvist'), 'and the file has the title and no “by” line');
		} finally {
			await closeAll(p);
			await dropStyles(p);
			await p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, { exportKind: 'manuscript', exportStyle: '' }); await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); const f = app.vault.getAbstractFileByPath('Salt'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
		}
	}),
});

specs.push({
	name: 'export short story: the heading over a story of one chapter is a choice, and “No heading” leaves every heading out, in the window’s pages and the Word file',
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
		await standIn(p);
		await makeStory(p);
		await withStyle(p, 'Headed story', '---\nexport-style: 1\nbased-on: Short story\none-chapter: its heading\n---\n');
		await withStyle(p, 'Headless', '---\nexport-style: 1\nbased-on: Standard manuscript\nheading: none\n---\n');
		await until(p, `!!${PL}.binders.binderOf('Salt')`, 8000);
		try {
			await openView(p, 'Salt');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(150);
			await choose(p, 'file', 'pdf');
			await choose(p, 'style', 'Headed story');
			t.ok(await laidOut(p), 'the pages are laid out');
			const first = (await pages(p))[0].text;
			t.ok(first.indexOf('Salt') < first.indexOf('Chapter One') && first.indexOf('Chapter One') < first.indexOf('The sea was flat.'), 'a style that sets the lone chapter’s heading: “Chapter One” stands between the title and the story');
			await choose(p, 'style', 'Headless');
			t.ok(await laidOut(p), 'laid out again');
			const shown = await pages(p), all = shown.map((s) => s.text).join('\n');
			t.ok(/title-page/.test(shown[0].cls) && !/Chapter/.test(all), 'No heading: the title page, and no “Chapter One” anywhere');
			t.ok(shown[1].text.includes('The sea was flat.') && all.includes('Then the wind came.'), 'and the story is there, all of it');
			await choose(p, 'file', 'docx');
			await until(p, `!!document.querySelector('${WIN} .binders-export-paper')`, 8000);
			t.eq(await p.ev(`document.querySelectorAll('${WIN} .binders-export-paper .binders-export-heading').length`), 0, 'the Word preview has no heading');
			await press(p, 'Export');
			t.ok(await saved(p), 'the Word file was saved');
			const xml = strFromU8(unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'Salt.docx'))))['word/document.xml']);
			t.ok(!xml.includes('w:val="Heading1"') && xml.includes('The sea was flat.') && xml.includes('Then the wind came.'), 'the Word file has no heading, and every word of the story');
		} finally {
			await closeAll(p);
			await dropStyles(p);
			await p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, { exportKind: 'manuscript', exportStyle: '' }); await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); const f = app.vault.getAbstractFileByPath('Salt'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
		}
	}),
});

specs.push({
	name: 'export short story: Book details can make each note outside a folder a chapter of its own, kept in the binder note, and the manuscript has them so',
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
		await standIn(p);
		await makeStory(p);
		await until(p, `!!${PL}.binders.binderOf('Salt')`, 8000);
		const chapters = (xml) => (xml.match(/w:val="Heading1"/g) ?? []).length;
		try {
			await openView(p, 'Salt');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(150);
			await choose(p, 'file', 'docx');
			const docx = () => strFromU8(unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'Salt.docx'))))['word/document.xml']);
			await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
			const field = '.modal.binders-bset .binders-book-details [data-binders-key="loose-notes"]';
			t.ok(await until(p, `!!document.querySelector('${field}')`, 6000), 'Book details has the choice');
			await p.ev(`(() => { const s = document.querySelector('${field}'); s.value = 'each a chapter'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
			t.ok(await until(p, `app.vault.adapter.read('Salt/Salt.md').then(x => x.includes('loose-notes: each a chapter'))`, 4000), 'it is kept in the binder note as the file format has it');
			await p.key('Escape');
			t.ok(await until(p, `document.querySelectorAll('${WIN} .binders-export-paper .binders-export-heading').length === 2`, 8000), 'the window reads the book again: two chapters in its preview');
			await press(p, 'Export');
			t.ok(await saved(p), 'the Word file was saved');
			t.eq(chapters(docx()), 2, 'and each note is a chapter of its own in the manuscript');
		} finally {
			await closeAll(p);
			await p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, { exportKind: 'manuscript', exportStyle: '' }); await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); const f = app.vault.getAbstractFileByPath('Salt'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
		}
	}),
});

specs.push({
	name: 'export short story: a loose note shown as “Prologue” by its title property is a chapter of its own, not a scene of the run',
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
		await standIn(p);
		await makeStory(p);
		await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Salt/One.md'); await app.vault.modify(f, '---\\ntitle: Prologue\\n---\\n' + await app.vault.read(f)); })().then(() => 1)`);
		await until(p, `app.metadataCache.getCache('Salt/One.md')?.frontmatter?.title === 'Prologue'`, 8000);
		await until(p, `!!${PL}.binders.binderOf('Salt')`, 8000);
		try {
			await openView(p, 'Salt');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(150);
			await choose(p, 'file', 'docx');
			t.ok(await until(p, `[...document.querySelectorAll('${WIN} .binders-export-paper .binders-export-heading')].map(h => h.textContent.trim()).join('|') === 'Prologue|Chapter One'`, 8000), 'the note shown as Prologue is its own chapter, and the other begins the first numbered one');
		} finally {
			await closeAll(p);
			await p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, { exportKind: 'manuscript', exportStyle: '' }); await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); const f = app.vault.getAbstractFileByPath('Salt'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
		}
	}),
});
