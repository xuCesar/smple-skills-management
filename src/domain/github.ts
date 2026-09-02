export type RepositoryLocator = { owner: string; repo: string; canonical: string }
export type ReviewFile = { path: string; kind: 'skill' | 'script' | 'executable' | 'symlink' | 'file' }
export type SkillReview = { source: RepositoryLocator; revision: string; skillPath: string; files: ReviewFile[]; skillContent: string; riskFlags: string[] }

export function parsePublicRepository(input: string): RepositoryLocator {
  const value = input.trim().replace(/\.git$/, '')
  const match = value.match(/^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s]+)$/i)
  if (!match) throw new Error('请输入 GitHub HTTPS 地址或 owner/repo')
  const [, owner, repo] = match
  if (owner.toLowerCase() === 'gist') throw new Error('不支持 Gist')
  return { owner, repo, canonical: `https://github.com/${owner}/${repo}` }
}

export function createPreviewReview(locator: RepositoryLocator): SkillReview {
  return { source: locator, revision: 'main@preview', skillPath: 'SKILL.md', files: [{ path: 'SKILL.md', kind: 'skill' }, { path: 'README.md', kind: 'file' }], skillContent: `# ${locator.repo}\n\n待从 GitHub 读取 SKILL.md`, riskFlags: [] }
}
