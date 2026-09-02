import type { ManagedInstallation, SkillDirectory } from './config'

export type DiscoveredSkill = {
  id: string
  name: string
  description: string
  path: string
  directory: string
  source: 'default' | 'user'
}

export type DiscoverySnapshot = {
  skills: DiscoveredSkill[]
  invalidDirectories: string[]
  conflicts: Array<{ path: string; directoryName: string; declaredName: string | null }>
  warnings: Array<{ path: string; message: string }>
  staleInstallations: ManagedInstallation[]
  scannedAt: string
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

function tauriInvoke(): Invoke | undefined {
  return (globalThis as { __TAURI__?: { core?: { invoke: Invoke } } }).__TAURI__?.core?.invoke
}

/** Executes a user-requested scan. In browser preview this returns an empty snapshot. */
export async function scanSkillDirectories(
  directories: SkillDirectory[],
  installations: ManagedInstallation[] = [],
): Promise<DiscoverySnapshot> {
  const invoke = tauriInvoke()
  if (!invoke) return { skills: [], invalidDirectories: [], conflicts: [], warnings: [], staleInstallations: [], scannedAt: new Date().toISOString() }
  const result = await invoke('scan_directories', {
    directories: directories.map((directory) => directory.path),
    installations,
  })
  return result as DiscoverySnapshot
}
