import { parsePublicRepository, type RepositoryLocator, type SkillReview } from './github.ts'
import type { ConfigStore, ManagedConfig } from './config.ts'
import { isIdentityConflict } from './identity.ts'

/** 生命周期操作的稳定标识，供 UI 和日志分类使用。 */
export type LifecycleOperation = 'review' | 'install' | 'update' | 'uninstall'

/** 不把底层文件系统或网络错误直接暴露给用户。 */
export type LifecycleErrorCode =
  | 'invalid-source'
  | 'source-unavailable'
  | 'skill-not-found'
  | 'multiple-skills'
  | 'unsafe-source'
  | 'review-required'
  | 'target-invalid'
  | 'target-conflict'
  | 'local-changes'
  | 'filesystem'
  | 'permission-denied'
  | 'not-managed'
  | 'confirmation-required'
  | 'unsupported'

const lifecycleMessages: Record<LifecycleErrorCode, string> = {
  'invalid-source': 'GitHub 来源格式不正确',
  'source-unavailable': '无法读取 GitHub 来源，请检查网络连接',
  'skill-not-found': '仓库中未找到有效的 SKILL.md',
  'multiple-skills': '仓库包含多个 Skill，请选择具体的 SKILL.md',
  'unsafe-source': '来源包含不安全或不支持的文件路径',
  'review-required': '安装前必须先完成 Skill review',
  'target-invalid': '安装目标不可用，请检查 Skill directory',
  'target-conflict': '安装目标已存在同名 Skill',
  'local-changes': '检测到本地修改，请先选择处理方式',
  filesystem: '文件操作失败，请检查目录权限',
  'permission-denied': '没有足够的目录权限完成操作',
  'not-managed': '该 Skill installation 不是由 Skill Desk 管理',
  'confirmation-required': '需要确认来源和 Installation target',
  unsupported: '该生命周期操作暂未实现',
}

export class SkillLifecycleError extends Error {
  readonly code: LifecycleErrorCode
  readonly operation: LifecycleOperation

  constructor(code: LifecycleErrorCode, operation: LifecycleOperation, cause?: unknown) {
    super(lifecycleMessages[code])
    this.name = 'SkillLifecycleError'
    this.code = code
    this.operation = operation
    if (cause !== undefined) this.cause = cause
  }
}

export function createLifecycleError(
  code: LifecycleErrorCode,
  operation: LifecycleOperation,
  cause?: unknown,
): SkillLifecycleError {
  return new SkillLifecycleError(code, operation, cause)
}

export type SourceTreeFile = {
  path: string
  content: string
  kind: 'file' | 'skill' | 'script' | 'executable' | 'symlink'
}

export type SourceTree = {
  source: RepositoryLocator
  revision: string
  skillPath: string
  files: SourceTreeFile[]
}

/** GitHub 适配器只负责读取内容，不负责写入本地目录或执行文件。 */
export interface SkillSourceAdapter {
  review(locator: RepositoryLocator, skillPath?: string): Promise<SkillReview>
  readTree(review: SkillReview): Promise<SourceTree>
}

export type InstallationTarget = {
  directory: string
  skillDirectoryName: string
}

export type InstallationInspection = {
  exists: boolean
  files: Record<string, string>
  hasLocalChanges: boolean
}

/** 文件系统适配器封装临时目录和替换细节，保证 service 不依赖平台 API。 */
export interface SkillFileSystemAdapter {
  inspect(target: InstallationTarget, expected?: Record<string, string>): Promise<InstallationInspection>
  createStagingDirectory(target: InstallationTarget): Promise<string>
  writeTree(stagingPath: string, tree: SourceTree): Promise<void>
  atomicReplace(stagingPath: string, target: InstallationTarget): Promise<void>
  remove(path: string): Promise<void>
}

export interface TrashAdapter {
  moveToTrash(target: InstallationTarget): Promise<void>
}

export type LifecyclePorts = {
  source: SkillSourceAdapter
  fileSystem: SkillFileSystemAdapter
  config: ConfigStore
  trash: TrashAdapter
}

export type ReviewRequest = { locator: string | RepositoryLocator; skillPath?: string }
export type InstallRequest = { review: SkillReview; target: InstallationTarget; confirmed: boolean }
export type UpdateChoice = 'cancel' | 'overwrite-backup' | 'install-new-copy'
export type UpdateRequest = InstallRequest & { skillId: string; choice?: UpdateChoice }
export type UninstallRequest = { skillId: string; target: InstallationTarget; confirmed: boolean }

export type LifecycleResult = {
  operation: Exclude<LifecycleOperation, 'review'>
  skillId: string
  target: InstallationTarget
}

function installationPath(target: InstallationTarget): string {
  const directory = target.directory.replace(/[\\/]$/, '')
  return `${directory}/${target.skillDirectoryName}`
}

function skillIdFromReview(review: SkillReview, target: InstallationTarget): string {
  const match = review.skillContent.match(/^(?:---[\s\S]*?\n)?name:\s*["']?([^\n"']+)["']?\s*$/m)
  const declared = match?.[1]?.trim()
  return declared || target.skillDirectoryName
}

function validateInstallRequest(request: InstallRequest): void {
  if (!request.confirmed) throw createLifecycleError('confirmation-required', 'install')
  if (!request.review || typeof request.review.revision !== 'string' || !request.review.source?.canonical) {
    throw createLifecycleError('review-required', 'install')
  }
  const { directory, skillDirectoryName } = request.target
  if (!directory.trim() || !skillDirectoryName.trim() || !/^[A-Za-z0-9._-]+$/.test(skillDirectoryName)) {
    throw createLifecycleError('target-invalid', 'install')
  }
  const declared = request.review.skillContent.match(/^name:\s*["']?([^\n"']+)["']?\s*$/m)?.[1]?.trim()
  if (declared && isIdentityConflict(skillDirectoryName, declared)) throw createLifecycleError('target-invalid', 'install')
}

/**
 * 生命周期唯一的业务 seam。后续实现只需替换 ports，不让 React 或 Tauri command 直接编排文件操作。
 */
export interface SkillLifecycleService {
  review(request: ReviewRequest): Promise<SkillReview>
  install(request: InstallRequest): Promise<LifecycleResult>
  update(request: UpdateRequest): Promise<LifecycleResult>
  uninstall(request: UninstallRequest): Promise<LifecycleResult>
}

type LifecycleHandlers = {
  install?: (request: InstallRequest) => Promise<LifecycleResult>
  update?: (request: UpdateRequest) => Promise<LifecycleResult>
  uninstall?: (request: UninstallRequest) => Promise<LifecycleResult>
}

/**
 * 创建 service seam。install/update/uninstall 在对应 ticket 实现前显式返回稳定错误，避免静默成功。
 * handlers 参数仅用于 fixture 和后续垂直切片注入已实现的操作。
 */
export function createSkillLifecycleService(ports: LifecyclePorts, handlers: LifecycleHandlers = {}): SkillLifecycleService {
  return {
    async review(request) {
      let locator: RepositoryLocator
      try {
        locator = typeof request.locator === 'string' ? parsePublicRepository(request.locator) : request.locator
      } catch (cause) {
        throw createLifecycleError('invalid-source', 'review', cause)
      }
      try {
        return await ports.source.review(locator, request.skillPath)
      } catch (cause) {
        if (cause instanceof SkillLifecycleError) throw cause
        if (cause && typeof cause === 'object' && 'code' in cause) {
          const code = (cause as { code?: unknown }).code
          if (code === 'skill-not-found' || code === 'multiple-skills' || code === 'unsafe-source') {
            throw createLifecycleError(code, 'review', cause)
          }
        }
        throw createLifecycleError('source-unavailable', 'review', cause)
      }
    },
    async install(request) {
      if (handlers.install) return handlers.install(request)
      validateInstallRequest(request)
      const targetPath = installationPath(request.target)
      let inspection: InstallationInspection
      try {
        inspection = await ports.fileSystem.inspect(request.target)
      } catch (cause) {
        throw createLifecycleError('filesystem', 'install', cause)
      }
      if (inspection.exists) throw createLifecycleError('target-conflict', 'install')

      let tree: SourceTree
      try {
        tree = await ports.source.readTree(request.review)
      } catch (cause) {
        if (cause instanceof SkillLifecycleError) throw cause
        throw createLifecycleError('source-unavailable', 'install', cause)
      }
      if (!tree.files.length || !tree.files.some((file) => file.path === tree.skillPath)) {
        throw createLifecycleError('skill-not-found', 'install')
      }
      if (tree.revision !== request.review.revision || tree.source.canonical !== request.review.source.canonical || tree.skillPath !== request.review.skillPath) {
        throw createLifecycleError('source-unavailable', 'install')
      }
      if (tree.files.some((file) => !file.path || file.path.startsWith('/') || file.path.split('/').some((part) => part === '.' || part === '..') || typeof file.content !== 'string')) {
        throw createLifecycleError('unsafe-source', 'install')
      }

      let stagingPath: string | undefined
      try {
        stagingPath = await ports.fileSystem.createStagingDirectory(request.target)
        await ports.fileSystem.writeTree(stagingPath, tree)
        await ports.fileSystem.atomicReplace(stagingPath, request.target)
      } catch (cause) {
        if (stagingPath) {
          try { await ports.fileSystem.remove(stagingPath) } catch { /* 清理失败不覆盖原始错误 */ }
        }
        throw createLifecycleError('filesystem', 'install', cause)
      }

      const skillId = skillIdFromReview(request.review, request.target)
      try {
        const current = await ports.config.load()
        const next: ManagedConfig = {
          ...current,
          installations: [
            ...current.installations.filter((installation) => installation.path !== targetPath),
            { skillId, path: targetPath, repository: request.review.source.canonical, revision: request.review.revision },
          ],
          updatedAt: new Date().toISOString(),
        }
        await ports.config.save(next)
      } catch (cause) {
        throw createLifecycleError('filesystem', 'install', cause)
      }
      return { operation: 'install', skillId, target: request.target }
    },
    async update(request) {
      if (handlers.update) return handlers.update(request)
      if (!request.confirmed) throw createLifecycleError('confirmation-required', 'update')
      const current = await ports.config.load()
      const managed = current.installations.find((installation) => installation.skillId === request.skillId && installation.path.endsWith(`/${request.target.skillDirectoryName}`))
      if (!managed) throw createLifecycleError('not-managed', 'update')
      const tree = await ports.source.readTree(request.review)
      const expected = Object.fromEntries(tree.files.map((file) => [file.path, file.content]))
      let inspection: InstallationInspection
      try { inspection = await ports.fileSystem.inspect(request.target, expected) } catch (cause) { throw createLifecycleError('filesystem', 'update', cause) }
      if (inspection.hasLocalChanges && !request.choice) throw createLifecycleError('local-changes', 'update')
      if (request.choice === 'cancel') throw createLifecycleError('local-changes', 'update')
      const target = request.choice === 'install-new-copy' ? { ...request.target, skillDirectoryName: `${request.target.skillDirectoryName}-${request.review.revision.slice(0, 7)}` } : request.target
      let stagingPath: string | undefined
      try {
        stagingPath = await ports.fileSystem.createStagingDirectory(target)
        await ports.fileSystem.writeTree(stagingPath, tree)
        await ports.fileSystem.atomicReplace(stagingPath, target)
      } catch (cause) {
        if (stagingPath) { try { await ports.fileSystem.remove(stagingPath) } catch { /* 保留原始错误 */ } }
        throw createLifecycleError('filesystem', 'update', cause)
      }
      const skillId = request.skillId
      const targetPath = installationPath(target)
      const nextInstallations = current.installations.filter((installation) => installation.path !== managed.path && (request.choice !== 'install-new-copy' || installation.path !== targetPath))
      nextInstallations.push({ skillId, path: targetPath, repository: request.review.source.canonical, revision: request.review.revision })
      await ports.config.save({ ...current, installations: nextInstallations, updatedAt: new Date().toISOString() })
      return { operation: 'update', skillId, target }
    },
    async uninstall(request) {
      if (handlers.uninstall) return handlers.uninstall(request)
      if (!request.confirmed) throw createLifecycleError('confirmation-required', 'uninstall')
      const current = await ports.config.load()
      const targetPath = installationPath(request.target)
      const managed = current.installations.find((installation) => installation.skillId === request.skillId && installation.path === targetPath)
      if (!managed) throw createLifecycleError('not-managed', 'uninstall')
      try { await ports.trash.moveToTrash(request.target) } catch (cause) { throw createLifecycleError('filesystem', 'uninstall', cause) }
      await ports.config.save({ ...current, installations: current.installations.filter((installation) => installation.path !== targetPath), updatedAt: new Date().toISOString() })
      return { operation: 'uninstall', skillId: request.skillId, target: request.target }
    },
  }
}

/** 供 fixture 使用的最小 Managed configuration store，不依赖 localStorage 或 Tauri。 */
export function createMemoryConfigStore(initial: ManagedConfig): ConfigStore & { value: ManagedConfig } {
  let value = initial
  return {
    get value() {
      return value
    },
    async load() {
      return value
    },
    async save(next) {
      value = next
    },
  }
}
