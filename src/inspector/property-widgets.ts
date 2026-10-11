import type { App } from 'obsidian';
import { drawField, inferKind, KIND_ICONS, KIND_NAMES, type Kind } from './property-fields';

/* Obsidian's own editors for a property's value, by the property's type: the ones a note's Properties are made of.
   UNDOCUMENTED (golden rule 5): `app.metadataTypeManager` and the widgets it holds are not in the public API. They
   are used here and nowhere else, every member checked before it is called and every call wrapped, and when anything
   is missing (an Obsidian without the manager, a widget that throws as it draws) `drawValue` draws Binders' own field
   instead (property-fields.ts), which reads and writes the value correctly by its kind. What is used:
     - `metadataTypeManager.getTypeInfo(key, value)` -> `{ expected, inferred }`, two widgets: the one the property's
       type asks for (`.obsidian/types.json`, else the type of the values the vault has for it) and the one this value
       is. They differ when a value isn't what its type says ("second" in a number).
     - a widget: `{ type, icon, name(), validate(value), render(el, value, ctx) }`, where `ctx` is `{ app, key,
       onChange(value), sourcePath, blur(), hoverSource }` and what comes back may have `focus()`. (Obsidian 1.13.
       Before 1.9 `render` took `{ key, type, value }` where the value is now: `minAppVersion` is past that.)
   docs/dev/internals.md has the row; specs-inspector-properties.mjs draws every type through it and without it. */

export type { Kind } from './property-fields';

export interface KindInfo {
	/** What the property is meant to hold. */
	kind: Kind;
	/** Obsidian's icon for it. */
	icon: string;
	/** Its name in Obsidian's own words ("Number"). */
	name: string;
	/** This value isn't of that type (and `is` says which it is). */
	mismatch: boolean;
	is: Kind;
}

interface Widget { type: string; icon: string; name: () => string; render: (el: HTMLElement, value: unknown, ctx: Record<string, unknown>) => unknown }
interface TypeManager { getTypeInfo: (key: string, value?: unknown) => { expected: Widget; inferred: Widget } | undefined }

const manager = (app: App): TypeManager | null => {
	const m = (app as unknown as { metadataTypeManager?: TypeManager }).metadataTypeManager;
	return m && typeof m.getTypeInfo === 'function' ? m : null;
};
const isWidget = (w: unknown): w is Widget => !!w && typeof (w as Widget).render === 'function' && typeof (w as Widget).type === 'string' && typeof (w as Widget).name === 'function';

/** Is Obsidian's own set of editors there to be used? */
export const hasWidgets = (app: App): boolean => { try { return isWidget(manager(app)?.getTypeInfo('binders-probe', '')?.expected); } catch { return false; } };

const KINDS = new Set<string>(Object.keys(KIND_NAMES));

/** A property's type and whether this value fits it. Without Obsidian's manager, the type of the value. */
export function kindOf(app: App, key: string, value: unknown): KindInfo {
	try {
		const info = manager(app)?.getTypeInfo(key, value);
		if (info && isWidget(info.expected) && isWidget(info.inferred) && KINDS.has(info.expected.type) && KINDS.has(info.inferred.type)) {
			return { kind: info.expected.type as Kind, icon: String(info.expected.icon), name: String(info.expected.name()), mismatch: info.expected !== info.inferred, is: info.inferred.type as Kind };
		}
	} catch { /* below */ }
	const kind = inferKind(value);
	return { kind, icon: KIND_ICONS[kind], name: KIND_NAMES[kind], mismatch: false, is: kind };
}

export interface ValueContext {
	key: string;
	/** The note the value is in, for the links in it. */
	sourcePath: string;
	onChange: (value: unknown) => void;
	/** The type to draw when Binders' own field is drawn and the value says none (it is empty). */
	kind?: Kind;
}
export interface Drawn {
	focus: () => void;
	/** Obsidian's own editor drew it (else Binders' own field). */
	native: boolean;
}

const blank = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Draws an editor for a value in `el`: Obsidian's own, of the type the value is (so a value that isn't of its
    property's type is shown as it stands, as Obsidian shows it), or of the property's type when there is no value to
    say. Binders' own field when that can't be done. Never throws. */
export function drawValue(app: App, el: HTMLElement, value: unknown, c0: ValueContext): Drawn {
	// (Obsidian's text and number fields say a change twice, on Enter and again as the keyboard leaves: once is enough)
	let last = JSON.stringify(value ?? null);
	// (and its text field left with nothing in it says a line break first: that is nothing, not a value)
	const c: ValueContext = { ...c0, onChange: (v) => { const to = typeof v === 'string' && v.trim() === '' ? '' : v, now = JSON.stringify(to ?? null); if (now === last) return; last = now; c0.onChange(to); } };
	try {
		const info = manager(app)?.getTypeInfo(c.key, value);
		const widget = info && (blank(value) ? info.expected : info.inferred);
		if (isWidget(widget)) {
			const made = widget.render(el, value, {
				app, key: c.key, sourcePath: c.sourcePath, onChange: c.onChange,
				// (what Obsidian's rows do when Enter or Esc ends an edit: the field lets go of the keyboard)
				blur: () => { const at = el.doc.activeElement; if (at?.instanceOf(HTMLElement) && el.contains(at)) at.blur(); },
				// (Page preview's own setting for links in properties)
				hoverSource: 'properties',
			});
			if (el.hasChildNodes()) {
				const focus = (made as { focus?: unknown } | null)?.focus;
				return { native: true, focus: () => { try { if (typeof focus === 'function') (focus as (this: unknown) => void).call(made); } catch { /* stays where it is */ } } };
			}
		}
	} catch { /* below */ }
	el.empty();
	const kind = blank(value) && c.kind ? c.kind : inferKind(value);
	return { native: false, focus: drawField(el, value, kind, { key: c.key, onChange: c.onChange }).focus };
}
