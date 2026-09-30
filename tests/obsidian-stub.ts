// Pure code under test doesn't touch Obsidian; this keeps the bundler happy if anything imports it.
export const normalizePath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
