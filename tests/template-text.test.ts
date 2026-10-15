import { DEFAULT_FORMATS, fillVars, noteText, stripKeys } from '../src/template-text';
import { done, eq } from './harness';

// A stand-in for Moment: says which format it was asked for, so what is filled where can be read.
const at = (f: string): string => `<${f}>`;

// the variables, as Obsidian's Templates core plugin fills them
{
	eq(fillVars('# {{title}}', 'The keeper', at), '# The keeper', 'the title');
	eq(fillVars('{{TITLE}} and {{Title}}', 'Mara', at), 'Mara and Mara', 'any case, every one');
	eq(fillVars('{{date}} {{time}}', 'x', at), '<YYYY-MM-DD> <HH:mm>', 'the default formats');
	eq(fillVars('{{date}} {{time}}', 'x', at, { date: 'D MMMM', time: 'h:mm a' }), '<D MMMM> <h:mm a>', 'the formats set in the core plugin');
	eq(fillVars('{{date:dddd}} at {{time:HH}}', 'x', at), '<dddd> at <HH>', 'a format of its own');
	eq(fillVars('{{DATE:YYYY}}', 'x', at), '<YYYY>', 'a format, any case');
	eq(fillVars('---\nstarted: {{date}}\ntitle: {{title}}\n---\n', 'Arrival', at), '---\nstarted: <YYYY-MM-DD>\ntitle: Arrival\n---\n', 'in the properties too');
	eq(fillVars('{{title}}', 'Costs $1 and $& more', at), 'Costs $1 and $& more', 'a title with $ in it is taken as it is');
	eq(fillVars('{{ title }} {{name}} {date}', 'x', at), '{{ title }} {{name}} {date}', 'what isn’t a variable is left');
	eq(fillVars('<% tp.file.title %> {{title}}', 'Mara', at), '<% tp.file.title %> Mara', 'Templater’s commands are left as written');
	eq(DEFAULT_FORMATS.date, 'YYYY-MM-DD', 'the core plugin’s default date format');
}

// Binders' own keys never pass from a template to a new note; every other byte does
{
	const t = '---\nbinder: 1\nstatus: Idea\ncontents:\n  - A\n  - B/\nchars: [Mara]\n---\nText\n';
	eq(stripKeys(t), '---\nstatus: Idea\nchars: [Mara]\n---\nText\n', 'binder and contents, with the list under it');
	eq(stripKeys('---\ncontents:\n- A\n- B\nstatus: x\n---\n'), '---\nstatus: x\n---\n', 'a list not indented under its key');
	eq(stripKeys('---\nstatus: Idea\n---\nbinder: 1\n'), '---\nstatus: Idea\n---\nbinder: 1\n', 'the text below the properties is not properties');
	eq(stripKeys('No properties.\nbinder: 1\n'), 'No properties.\nbinder: 1\n', 'a note with none');
	eq(stripKeys('---\r\nbinder: 1\r\nstatus: Idea\r\n---\r\nText'), '---\r\nstatus: Idea\r\n---\r\nText', 'Windows line endings');
	eq(stripKeys('---\nbinder-ish: 1\nmy binder: 2\n---\n'), '---\nbinder-ish: 1\nmy binder: 2\n---\n', 'only those keys, exactly');
	eq(stripKeys('---\n"binder": 1\nx: 2\n---\n'), '---\nx: 2\n---\n', 'a quoted key');
	eq(stripKeys('---\nbinder: 1\n---\n'), '---\n---\n', 'all of it');
	eq(stripKeys('---\nstatus: a\n---'), '---\nstatus: a\n---', 'properties with nothing after them');
	eq(stripKeys('---\nunclosed: 1\nbinder: 1\n'), '---\nunclosed: 1\nbinder: 1\n', 'properties never closed are text');
	eq(stripKeys('---\nnotes: |\n  binder: 1\nbinder: 1\n---\n'), '---\nnotes: |\n  binder: 1\n---\n', 'a line inside another key’s text is that key’s');
}

// together
{
	eq(noteText('---\nbinder: 1\nstatus: Idea\n---\n# {{title}}\n', 'The wreck', at), '---\nstatus: Idea\n---\n# The wreck\n', 'a template made into a note');
}

done('template text');
