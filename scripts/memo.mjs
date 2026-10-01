// Progress memos: a few lines an agent keeps up to date while it works, so the coordinator (or the maintainer) can see
// where every ticket stands without interrupting anyone. One small file per ticket in .claude/memos/ (not in git).
//   npm run memo                                         every ticket: status, how long since it was updated, what it's on
//   npm run memo -- <ticket>                             one ticket's memo, whole
//   npm run memo -- <ticket> <status> "<now>" ["<next>"] update it (status: working, verifying, blocked, done)
// See AGENTS.md, "Progress memos".
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// always the real project's folder, also when run from a scratch copy of it (BINDERS_MEMOS says where)
const dir = process.env.BINDERS_MEMOS || join(dirname(dirname(fileURLToPath(import.meta.url))), '.claude', 'memos');
const STATUSES = ['working', 'verifying', 'blocked', 'done'], LOG_KEPT = 30;
const [ticket, status, now, next] = process.argv.slice(2);
const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const field = (text, name) => new RegExp(`^${name}: (.*)$`, 'm').exec(text)?.[1] ?? '';

if (!ticket) {
	const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
	if (!files.length) { console.log('No memos yet.'); process.exit(0); }
	const rows = files.map((f) => {
		const text = readFileSync(join(dir, f), 'utf8'), at = Date.parse(field(text, 'updated').replace(' ', 'T'));
		const mins = Number.isFinite(at) ? Math.round((Date.now() - at) / 60000) : null;
		return [f.replace(/\.md$/, ''), field(text, 'status'), mins == null ? '?' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`, field(text, 'now')];
	});
	const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
	for (const r of rows) console.log(`${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`);
	process.exit(0);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(ticket)) { console.error('A ticket is named in lower-case words joined by hyphens, such as "snapshots" or "qa-mobile-outliner".'); process.exit(1); }
const path = join(dir, ticket + '.md');
if (!status) { console.log(existsSync(path) ? readFileSync(path, 'utf8') : `No memo for “${ticket}”.`); process.exit(0); }
if (!STATUSES.includes(status) || !now) { console.error(`Usage: npm run memo -- <ticket> <${STATUSES.join('|')}> "<what you're on, one line>" ["<what's next, one line>"]`); process.exit(1); }
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
const old = existsSync(path) ? readFileSync(path, 'utf8') : '', at = stamp();
const log = (old.split('\n## Log\n')[1] ?? '').split('\n').filter((l) => l.startsWith('- '));
const text = `# ${ticket}\nstatus: ${status}\nupdated: ${at}\nnow: ${one(now)}\nnext: ${one(next) || '-'}\nstarted: ${field(old, 'started') || at}\n\n## Log\n${[`- ${at.slice(11)} [${status}] ${one(now)}`, ...log].slice(0, LOG_KEPT).join('\n')}\n`;
mkdirSync(dir, { recursive: true });
writeFileSync(path, text);
console.log(`${ticket}: ${status}, ${one(now)}`);
