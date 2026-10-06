/* A small, bounded XML reader for project indexes. No DTDs, external entities or recovery from malformed XML:
   recovering a broken index can turn writing into an apparently empty document. Pure, including in tests. */
export interface Element { name: string; attrs: Record<string, string>; children: Element[]; text: string }
export const children = (el: Element, name: string): Element[] => el?.children.filter((c) => c.name === name) ?? [];
export const child = (el: Element, name: string): Element | undefined => children(el, name)[0];
export const value = (el: Element, name: string): string => child(el, name)?.text ?? '';

/** Whatever is wrong with it, the writer is told the one thing that matters: this file can't be trusted. */
const damaged = () => new Error('The project’s list of documents (its .scrivx file) is damaged, so the project can’t be read.');

function entities(s: string): string {
	return s.replace(/&([^;]*);|&/g, (_, code: string) => {
		const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
		if (Object.prototype.hasOwnProperty.call(named, code)) return named[code];
		if (/^#(?:\d+|x[\da-f]+)$/i.test(code ?? '')) {
			const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
			if (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) return String.fromCodePoint(n);
		}
		throw damaged();
	});
}

export function readXml(source: string): Element {
	if (source.length > 10_000_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw damaged();
	const top: Element = { name: '', attrs: {}, children: [], text: '' }, stack = [top];
	let pos = 0, count = 0;
	while (pos < source.length) {
		const current = stack[stack.length - 1];
		if (source.startsWith('<!--', pos) || source.startsWith('<?', pos) || source.startsWith('<![CDATA[', pos)) {
			const cdata = source.startsWith('<![CDATA[', pos), comment = source.startsWith('<!--', pos);
			const end = cdata ? ']]>' : comment ? '-->' : '?>', from = pos + (cdata ? 9 : comment ? 4 : 2), to = source.indexOf(end, from);
			if (to < 0) throw damaged();
			if (cdata) current.text += source.slice(from, to);
			pos = to + end.length; continue;
		}
		if (source[pos] !== '<') {
			const end = source.indexOf('<', pos), to = end < 0 ? source.length : end;
			current.text += entities(source.slice(pos, to)); pos = to; continue;
		}
		const m = /^<\/?([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(source.slice(pos));
		if (!m) throw damaged();
		pos += m[0].length;
		if (m[0][1] === '/') {
			if (stack.length === 1 || current.name !== m[1] || m[2].trim()) throw damaged();
			stack.pop(); continue;
		}
		if (++count > 100_000 || stack.length > 100) throw damaged();
		const attrs: Record<string, string> = Object.create(null) as Record<string, string>, empty = /\/\s*$/.test(m[2]);
		let rest = m[2].replace(/\/\s*$/, '');
		while (rest.trim()) {
			const a = /^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
			if (!a || Object.prototype.hasOwnProperty.call(attrs, a[1])) throw damaged();
			attrs[a[1]] = entities(a[2] ?? a[3]); rest = rest.slice(a[0].length);
		}
		const el: Element = { name: m[1], attrs, children: [], text: '' };
		current.children.push(el);
		if (!empty) stack.push(el);
	}
	if (stack.length !== 1 || top.children.length !== 1 || top.text.trim().replace(/^\ufeff/, '')) throw damaged();
	return top.children[0];
}
