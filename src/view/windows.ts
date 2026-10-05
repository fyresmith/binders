import type { App } from 'obsidian';

/* A view may be in a window of its own (a popout), and may be moved to one while it's open. What belongs to a window
   is then that window's, not the main one's: a `ResizeObserver` made in the main window is told nothing of an element
   in another, and the main window's frames stop when it is minimised, though the popout is being worked in. */

/** Tells `fn` when `el` changes size, in whichever window `el` is: the observer is made in that window, and made
    again when `el` has been moved to another (a tab moved to a window of its own changes the layout; Obsidian's own
    `onWindowMigrated` isn't used, since it puts an animation on the element to find out). Returns what stops it. */
export function watchSize(app: App, el: HTMLElement, fn: () => void): () => void {
	let ro: ResizeObserver | null = null, win: Window | null = null;
	const watch = () => {
		if (el.win === win) return;
		win = el.win;
		ro?.disconnect();
		ro = new (win as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver(() => fn());
		ro.observe(el);
	};
	watch();
	const ref = app.workspace.on('layout-change', watch);
	return () => { app.workspace.offref(ref); ro?.disconnect(); ro = null; };
}
