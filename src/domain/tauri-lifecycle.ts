export type LifecycleFile = {
  path: string
  kind: 'skill' | 'script' | 'executable' | 'file'
}

export type LifecycleReview = {
  reviewId: string
  source: string
  revision: string
  skillPath: string
  skillId: string
  files: LifecycleFile[]
  skillContent: string
  riskFlags: string[]
  availableSkillPaths: string[]
}

export type LifecycleResult = {
  operation: 'install' | 'update' | 'uninstall'
  skillId: string
  path: string
  revision?: string
}

export type UpdateDiffEntry = { path: string; kind: 'added' | 'changed' | 'removed' }

export type UpdateReview = LifecycleReview & {
  installationPath: string
  hasLocalChanges: boolean
  diff: UpdateDiffEntry[]
}

export type UpdateChoice = 'cancel' | 'overwrite-backup' | 'install-new-copy'

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

function invoke(): Invoke | undefined {
  return (globalThis as { __TAURI__?: { core?: { invoke: Invoke } } }).__TAURI__?.core?.invoke
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('生命周期服务返回的数据格式无效')
  return value as Record<string, unknown>
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('生命周期服务返回的数据格式无效')
  return value
}

function parseReview(value: unknown): LifecycleReview {
  const input = record(value)
  const files = input.files
  if (!Array.isArray(files)) throw new Error('生命周期服务返回的数据格式无效')
  const parsedFiles = files.map((item) => {
    const file = record(item)
    if (typeof file.path !== 'string' || !['skill', 'script', 'executable', 'file'].includes(String(file.kind))) throw new Error('生命周期服务返回的数据格式无效')
    return { path: file.path, kind: file.kind as LifecycleFile['kind'] }
  })
  if (typeof input.reviewId !== 'string' || typeof input.source !== 'string' || typeof input.revision !== 'string' || typeof input.skillPath !== 'string' || typeof input.skillId !== 'string' || typeof input.skillContent !== 'string') throw new Error('生命周期服务返回的数据格式无效')
  return { reviewId: input.reviewId, source: input.source, revision: input.revision, skillPath: input.skillPath, skillId: input.skillId, skillContent: input.skillContent, files: parsedFiles, riskFlags: strings(input.riskFlags), availableSkillPaths: strings(input.availableSkillPaths) }
}

function parseResult(value: unknown): LifecycleResult {
  const input = record(value)
  if (!['install', 'update', 'uninstall'].includes(String(input.operation)) || typeof input.skillId !== 'string' || typeof input.path !== 'string' || (input.revision !== undefined && typeof input.revision !== 'string')) throw new Error('生命周期服务返回的数据格式无效')
  return { operation: input.operation as LifecycleResult['operation'], skillId: input.skillId, path: input.path, ...(typeof input.revision === 'string' ? { revision: input.revision } : {}) }
}

export function lifecycleAvailable(): boolean {
  return Boolean(invoke())
}

export async function reviewLifecycleSource(locator: string, skillPath?: string): Promise<LifecycleReview> {
  const call = invoke()
  if (!call) throw new Error('浏览器预览仅支持本地浏览；请在 Skill Desk 桌面端审查和安装')
  return parseReview(await call('lifecycle_review', { args: { locator, skill_path: skillPath } }))
}

export async function installReviewedSkill(reviewId: string, directory: string, skillDirectoryName: string, confirmed: boolean): Promise<LifecycleResult> {
  const call = invoke()
  if (!call) throw new Error('浏览器预览不能写入本机 Skill directory')
  return parseResult(await call('lifecycle_install', { args: { review_id: reviewId, directory, skill_directory_name: skillDirectoryName, confirmed } }))
}

export async function prepareSkillUpdate(installationPath: string): Promise<UpdateReview> {
  const call = invoke()
  if (!call) throw new Error('浏览器预览不能检查 Managed installation 更新')
  const value = record(await call('lifecycle_prepare_update', { args: { installation_path: installationPath } }))
  const review = parseReview(value)
  if (typeof value.installationPath !== 'string' || typeof value.hasLocalChanges !== 'boolean' || !Array.isArray(value.diff)) throw new Error('生命周期服务返回的数据格式无效')
  const diff = value.diff.map((item) => {
    const entry = record(item)
    if (typeof entry.path !== 'string' || !['added', 'changed', 'removed'].includes(String(entry.kind))) throw new Error('生命周期服务返回的数据格式无效')
    return { path: entry.path, kind: entry.kind as UpdateDiffEntry['kind'] }
  })
  return { ...review, installationPath: value.installationPath, hasLocalChanges: value.hasLocalChanges, diff }
}

export async function applySkillUpdate(reviewId: string, installationPath: string, choice: UpdateChoice, confirmed: boolean): Promise<LifecycleResult> {
  const call = invoke()
  if (!call) throw new Error('浏览器预览不能更新 Managed installation')
  return parseResult(await call('lifecycle_apply_update', { args: { review_id: reviewId, installation_path: installationPath, choice, confirmed } }))
}

export async function uninstallManagedSkill(installationPath: string, confirmed: boolean): Promise<LifecycleResult> {
  const call = invoke()
  if (!call) throw new Error('浏览器预览不能卸载 Managed installation')
  return parseResult(await call('lifecycle_uninstall', { args: { installation_path: installationPath, confirmed } }))
}
