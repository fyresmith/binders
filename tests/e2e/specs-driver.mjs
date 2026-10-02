import { launch } from './driver.mjs';

export const specs = [{
	name: 'driver: simultaneous sessions stay in their own throwaway vaults even when random port choices collide',
	async fn(_p, _h, t) {
		const random = Math.random, sessions = [];
		try {
			Math.random = () => 0;
			sessions.push(await launch());
			sessions.push(await launch({ theme: 'dark' }));
			for (const s of sessions) t.eq(await s.ev('app.vault.adapter.basePath'), s.vaultDir, 'each session opens its own copy');
			await sessions[0].ev("app.vault.create('Isolation marker.md', 'Only in the first vault').then(() => 1)");
			t.eq(await sessions[1].ev("!!app.vault.getAbstractFileByPath('Isolation marker.md')"), false, 'a write in one copy does not reach the other');
		} finally {
			Math.random = random;
			for (const s of sessions) await s.close();
		}
	},
}];
