import { parsePublicRepository, type RepositoryLocator, type SkillReview } from './github.ts'
import type { ConfigStore, ManagedConfig } from './config.ts'

/** 生命周期操作的稳定标识，供 UI 和日志分类使用。 */
export type LifecycleOperation = 'review' | 'install' | 'update' | 'uninstall'

/** 不把底层文件系统或网络错误直接暴露给用户。 */
export type LifecycleErrorCode =
  | 'invalid-source'
  | 'source-unavailable'
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
  review(locator: RepositoryLocator): Promise<SkillReview>
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

export type ReviewRequest = { locator: string | RepositoryLocator }
export type InstallRequest = { review: SkillReview; target: InstallationTarget; confirmed: boolean }
export type UpdateRequest = InstallRequest & { skillId: string }
export type UninstallRequest = { skillId: string; target: InstallationTarget; confirmed: boolean }

export type LifecycleResult = {
  operation: Exclude<LifecycleOperation, 'review'>
  skillId: string
  target: InstallationTarget
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
        return await ports.source.review(locator)
      } catch (cause) {
        if (cause instanceof SkillLifecycleError) throw cause
        throw createLifecycleError('source-unavailable', 'review', cause)
      }
    },
    async install(request) {
      if (!handlers.install) throw createLifecycleError('unsupported', 'install')
      return handlers.install(request)
    },
    async update(request) {
      if (!handlers.update) throw createLifecycleError('unsupported', 'update')
      return handlers.update(request)
    },
    async uninstall(request) {
      if (!handlers.uninstall) throw createLifecycleError('unsupported', 'uninstall')
      return handlers.uninstall(request)
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
