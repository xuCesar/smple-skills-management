/** GitHub 仓库的稳定定位信息。ref 用于固定用户明确提供的 branch/tag/commit。 */
export type RepositoryLocator = { owner: string; repo: string; canonical: string; ref?: string }

export type ReviewFile = { path: string; kind: 'skill' | 'script' | 'executable' | 'symlink' | 'file' }

export type SkillReview = {
  source: RepositoryLocator
  /** GitHub commit SHA，确保 review 与后续操作针对同一份内容。 */
  revision: string
  skillPath: string
  /** 仓库中可供用户选择的 Skill 声明路径。 */
  availableSkillPaths?: string[]
  files: ReviewFile[]
  skillContent: string
  riskFlags: string[]
}

/** source adapter 使用的可操作错误，不携带底层响应正文。 */
export type SourceReviewErrorCode = 'skill-not-found' | 'multiple-skills' | 'unsafe-source' | 'source-unavailable'

const sourceReviewMessages: Record<SourceReviewErrorCode, string> = {
  'skill-not-found': '仓库中未找到有效的 SKILL.md',
  'multiple-skills': '仓库包含多个 Skill，请选择具体的 SKILL.md',
  'unsafe-source': '来源包含不安全或不支持的文件路径',
  'source-unavailable': '无法读取 GitHub 来源，请检查网络连接',
}

export class PublicGitHubSourceError extends Error {
  readonly code: SourceReviewErrorCode

  constructor(code: SourceReviewErrorCode, cause?: unknown) {
    super(sourceReviewMessages[code])
    this.name = 'PublicGitHubSourceError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * 解析公开 GitHub repository locator。只接受 github.com HTTPS URL 或 owner/repo，
 * 不发起网络请求；仓库路径之外的 URL 会被拒绝，避免把下载地址误当作来源。
 */
export function parsePublicRepository(input: string): RepositoryLocator {
  const value = input.trim().replace(/\.git$/, '')
  const match = value.match(/^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s]+)$/i)
  if (!match) throw new Error('请输入 GitHub HTTPS 地址或 owner/repo')
  const [, owner, repoWithRef] = match
  if (owner.toLowerCase() === 'gist') throw new Error('不支持 Gist')
  const [repo, ref] = repoWithRef.split('@', 2)
  if (!repo || repo.includes(':')) throw new Error('请输入 GitHub HTTPS 地址或 owner/repo')
  return { owner, repo, ...(ref ? { ref } : {}), canonical: `https://github.com/${owner}/${repo}` }
}

export function createPreviewReview(locator: RepositoryLocator): SkillReview {
  return {
    source: locator,
    revision: `${locator.ref ?? 'main'}@preview`,
    skillPath: 'SKILL.md',
    files: [{ path: 'SKILL.md', kind: 'skill' }, { path: 'README.md', kind: 'file' }],
    skillContent: `# ${locator.repo}\n\n待从 GitHub 读取 SKILL.md`,
    riskFlags: [],
  }
}

type GithubTreeEntry = { path?: unknown; mode?: unknown; type?: unknown; sha?: unknown; url?: unknown }
type GithubResponse = { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }
export type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<GithubResponse>
type GithubBlob = { content?: unknown; encoding?: unknown }

const skillDeclaration = /(?:^|\/)SKILL\.md$/i
const scriptExtension = /\.(?:sh|bash|zsh|fish|py|rb|pl|js|mjs|cjs|ts|tsx|jsx|command)$/i

function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false
  const parts = path.split('/')
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
}

function decodeBlob(blob: GithubBlob): string {
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new PublicGitHubSourceError('source-unavailable')
  const normalized = blob.content.replace(/\s/g, '')
  try {
    const binary = atob(normalized)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch (cause) {
    throw new PublicGitHubSourceError('source-unavailable', cause)
  }
}

function defaultFetch(): FetchLike {
  const fetchImpl = globalThis.fetch
  if (!fetchImpl) throw new PublicGitHubSourceError('source-unavailable')
  return async (input, init) => fetchImpl(input, init) as unknown as GithubResponse
}

/** 公开 GitHub source 的只读适配器，只读取 API 返回的 blob，绝不写入或执行文件。 */
export class PublicGitHubSourceAdapter {
  private readonly fetchImpl: FetchLike

  constructor(fetchImpl: FetchLike = defaultFetch()) {
    this.fetchImpl = fetchImpl
  }

  async review(locator: RepositoryLocator, requestedSkillPath?: string): Promise<SkillReview> {
    try {
      const revision = await this.resolveRevision(locator)
      const entries = await this.readTreeEntries(locator, revision)
      for (const entry of entries) {
        if (typeof entry.path !== 'string' || !isSafeRelativePath(entry.path)) throw new PublicGitHubSourceError('unsafe-source')
      }
      const skillPaths = entries.filter((entry) => typeof entry.path === 'string' && skillDeclaration.test(entry.path)).map((entry) => entry.path as string)
      if (skillPaths.length === 0) throw new PublicGitHubSourceError('skill-not-found')
      const skillPath = this.selectSkillPath(skillPaths, requestedSkillPath)
      const root = skillPath.includes('/') ? skillPath.slice(0, skillPath.lastIndexOf('/')) : ''
      const scoped = entries.filter((entry) => {
        if (typeof entry.path !== 'string') return false
        if (!root) return !entry.path.includes('/')
        return entry.path.startsWith(`${root}/`)
      })
      const files: ReviewFile[] = []
      const contents = new Map<string, string>()
      const normalizedPaths = new Set<string>()
      const riskFlags = new Set<string>()
      for (const entry of scoped) {
        const path = entry.path as string
        const relativePath = root ? path.slice(root.length + 1) : path
        if (!isSafeRelativePath(relativePath) || normalizedPaths.has(relativePath)) throw new PublicGitHubSourceError('unsafe-source')
        normalizedPaths.add(relativePath)
        // Git tree 中的目录条目不是 Skill 文件清单的一部分。
        if (entry.type === 'tree') continue
        const kind = this.classifyEntry(entry, relativePath)
        if (kind === 'symlink') {
          riskFlags.add('包含 symlink，安装前请确认目标路径')
          const target = await this.readBlob(entry)
          if (target.startsWith('/') || target.split('/').includes('..')) throw new PublicGitHubSourceError('unsafe-source')
          contents.set(relativePath, target)
        } else if (kind !== 'file' || entry.type === 'blob') {
          contents.set(relativePath, await this.readBlob(entry))
        }
        if (kind === 'script' || kind === 'executable') riskFlags.add('包含可执行或脚本文件')
        files.push({ path: relativePath, kind })
      }
      const declarationPath = root ? skillPath.slice(root.length + 1) : skillPath
      const declarationContent = contents.get(declarationPath)
      if (declarationContent === undefined) throw new PublicGitHubSourceError('skill-not-found')
      return {
        source: locator,
        revision,
        skillPath: declarationPath,
        availableSkillPaths: skillPaths.map((path) => root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path),
        files,
        skillContent: declarationContent,
        riskFlags: [...riskFlags],
      }
    } catch (cause) {
      if (cause instanceof PublicGitHubSourceError) throw cause
      throw new PublicGitHubSourceError('source-unavailable', cause)
    }
  }

  private selectSkillPath(paths: string[], requested?: string): string {
    if (requested) {
      if (!isSafeRelativePath(requested)) throw new PublicGitHubSourceError('unsafe-source')
      const found = paths.find((path) => path === requested || path.endsWith(`/${requested}`))
      if (!found) throw new PublicGitHubSourceError('skill-not-found')
      return found
    }
    const root = paths.find((path) => !path.includes('/'))
    if (root) return root
    if (paths.length > 1) throw new PublicGitHubSourceError('multiple-skills')
    return paths[0]
  }

  private async resolveRevision(locator: RepositoryLocator): Promise<string> {
    const ref = locator.ref ?? 'HEAD'
    const response = await this.request(`https://api.github.com/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.repo)}/commits/${encodeURIComponent(ref)}`)
    const payload = await response.json()
    if (!response.ok || !payload || typeof payload !== 'object' || typeof (payload as { sha?: unknown }).sha !== 'string') throw new PublicGitHubSourceError('source-unavailable')
    return (payload as { sha: string }).sha
  }

  private async readTreeEntries(locator: RepositoryLocator, revision: string): Promise<GithubTreeEntry[]> {
    const response = await this.request(`https://api.github.com/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.repo)}/git/trees/${encodeURIComponent(revision)}?recursive=1`)
    const payload = await response.json()
    if (!response.ok || !payload || typeof payload !== 'object' || !Array.isArray((payload as { tree?: unknown }).tree)) throw new PublicGitHubSourceError('source-unavailable')
    return (payload as { tree: unknown[] }).tree.filter((entry): entry is GithubTreeEntry => !!entry && typeof entry === 'object')
  }

  private classifyEntry(entry: GithubTreeEntry, relativePath: string): ReviewFile['kind'] {
    if (entry.mode === '120000') return 'symlink'
    if (skillDeclaration.test(relativePath)) return 'skill'
    if (entry.mode === '100755') return 'executable'
    if (scriptExtension.test(relativePath)) return 'script'
    if (entry.type !== 'blob') throw new PublicGitHubSourceError('unsafe-source')
    return 'file'
  }

  private async readBlob(entry: GithubTreeEntry): Promise<string> {
    if (typeof entry.url !== 'string') throw new PublicGitHubSourceError('source-unavailable')
    const response = await this.request(entry.url)
    const payload = await response.json()
    if (!response.ok || !payload || typeof payload !== 'object') throw new PublicGitHubSourceError('source-unavailable')
    return decodeBlob(payload as GithubBlob)
  }

  private async request(url: string): Promise<GithubResponse> {
    const response = await this.fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'skill-desk' } })
    if (!response || typeof response.ok !== 'boolean') throw new PublicGitHubSourceError('source-unavailable')
    return response
  }
}

export function createPublicGitHubSourceAdapter(fetchImpl?: FetchLike): PublicGitHubSourceAdapter {
  return new PublicGitHubSourceAdapter(fetchImpl)
}
