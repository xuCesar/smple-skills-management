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

/** 执行用户主动发起的扫描；浏览器预览环境返回空快照。 */
function isDiscoverySnapshot(value: unknown): value is DiscoverySnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  return Array.isArray(snapshot.skills) && Array.isArray(snapshot.invalidDirectories) && Array.isArray(snapshot.conflicts) && Array.isArray(snapshot.warnings) && Array.isArray(snapshot.staleInstallations) && typeof snapshot.scannedAt === 'string'
}
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
  if (!isDiscoverySnapshot(result)) throw new Error('扫描返回的数据格式无效')
  return result
}
