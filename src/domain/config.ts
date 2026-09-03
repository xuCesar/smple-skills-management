export const CONFIG_VERSION = 1 as const

export type SkillDirectory = { path: string; source: 'default' | 'user' }
export type InstallationManifestEntry = { path: string; size: number; sha256?: string }
export type ManagedInstallation = { skillId: string; path: string; repository?: string; revision?: string; skillPath?: string; manifest?: InstallationManifestEntry[] }
export type ManagedConfig = { version: typeof CONFIG_VERSION; directories: SkillDirectory[]; hiddenSkillIds: string[]; installations: ManagedInstallation[]; updatedAt: string }

const defaultDirectories: SkillDirectory[] = [
  { path: '~/.agents/skills', source: 'default' },
  { path: '~/.codex/skills', source: 'default' },
  { path: '~/.claude/skills', source: 'default' },
]

export function createDefaultConfig(now = new Date().toISOString()): ManagedConfig {
  return { version: CONFIG_VERSION, directories: defaultDirectories, hiddenSkillIds: [], installations: [], updatedAt: now }
}

export function dedupeDirectories(directories: SkillDirectory[]): SkillDirectory[] {
  const seen = new Set<string>()
  return directories.map((d) => ({ ...d, path: d.path.trim().replace(/\\/g, '/').replace(/\/$/, '') })).filter((d) => d.path && !seen.has(d.path) && seen.add(d.path))
}

export function normalizeConfig(input: unknown, now = new Date().toISOString()): ManagedConfig {
  if (!input || typeof input !== 'object') throw new Error('Invalid configuration')
  const value = input as Record<string, unknown>
  if (value.version !== CONFIG_VERSION || !Array.isArray(value.directories) || !Array.isArray(value.hiddenSkillIds) || !Array.isArray(value.installations)) throw new Error('Unsupported configuration version')
  const directories = value.directories.filter((d): d is SkillDirectory => !!d && typeof d === 'object' && typeof (d as Record<string, unknown>).path === 'string' && ((d as Record<string, unknown>).source === 'default' || (d as Record<string, unknown>).source === 'user'))
  return { version: CONFIG_VERSION, directories: dedupeDirectories(directories), hiddenSkillIds: value.hiddenSkillIds.filter((id): id is string => typeof id === 'string'), installations: value.installations.filter((i): i is ManagedInstallation => !!i && typeof i === 'object' && typeof (i as Record<string, unknown>).skillId === 'string' && typeof (i as Record<string, unknown>).path === 'string'), updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now }
}

export interface ConfigStore { load(): Promise<ManagedConfig>; save(config: ManagedConfig): Promise<void> }

export function createConfigStore(): ConfigStore {
  const invoke = (globalThis as { __TAURI__?: { core?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } } }).__TAURI__?.core?.invoke
  if (invoke) return { async load() { return normalizeConfig(await invoke('load_config')) }, async save(config) { await invoke('save_config', { config }) } }
  const key = 'skill-desk.managed-config'
  return { async load() { const raw = localStorage.getItem(key); if (!raw) return createDefaultConfig(); try { return normalizeConfig(JSON.parse(raw)) } catch { localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw); const fresh = createDefaultConfig(); localStorage.setItem(key, JSON.stringify(fresh)); return fresh } }, async save(config) { localStorage.setItem(key, JSON.stringify({ ...config, version: CONFIG_VERSION, updatedAt: new Date().toISOString() })) } }
}
