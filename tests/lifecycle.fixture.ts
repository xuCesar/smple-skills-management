import type { ConfigStore } from '../src/domain/config.ts'
import type { RepositoryLocator, SkillReview } from '../src/domain/github.ts'
import {
  createMemoryConfigStore,
  createSkillLifecycleService,
  type InstallationInspection,
  type InstallationTarget,
  type LifecyclePorts,
  type SkillFileSystemAdapter,
  type SkillSourceAdapter,
  type SourceTree,
  type TrashAdapter,
} from '../src/domain/lifecycle.ts'
import { createDefaultConfig } from '../src/domain/config.ts'

export class FixtureSourceAdapter implements SkillSourceAdapter {
  readonly reviewed: RepositoryLocator[] = []
  readTreeCalls = 0
  private readonly reviewValue: SkillReview

  constructor(reviewValue: SkillReview) {
    this.reviewValue = reviewValue
  }

  async review(locator: RepositoryLocator): Promise<SkillReview> {
    this.reviewed.push(locator)
    return { ...this.reviewValue, source: locator }
  }

  async readTree(review: SkillReview): Promise<SourceTree> {
    this.readTreeCalls += 1
    return {
      source: review.source,
      revision: review.revision,
      skillPath: review.skillPath,
      files: review.files.map((file) => ({ path: file.path, content: file.path === review.skillPath ? review.skillContent : '', kind: file.kind })),
    }
  }
}

export class FixtureFileSystemAdapter implements SkillFileSystemAdapter {
  readonly staging: string[] = []
  readonly replaced: Array<{ stagingPath: string; target: InstallationTarget }> = []

  async inspect(_target: InstallationTarget): Promise<InstallationInspection> {
    return { exists: false, files: {}, hasLocalChanges: false }
  }

  async createStagingDirectory(_target: InstallationTarget): Promise<string> {
    const path = `/fixture/staging/${this.staging.length + 1}`
    this.staging.push(path)
    return path
  }

  async writeTree(_stagingPath: string, _tree: SourceTree): Promise<void> {}

  async atomicReplace(stagingPath: string, target: InstallationTarget): Promise<void> {
    this.replaced.push({ stagingPath, target })
  }

  async remove(_path: string): Promise<void> {}
}

export class FixtureTrashAdapter implements TrashAdapter {
  readonly moved: InstallationTarget[] = []

  async moveToTrash(target: InstallationTarget): Promise<void> {
    this.moved.push(target)
  }
}

export function createLifecycleFixture(review?: SkillReview) {
  const source = new FixtureSourceAdapter(review ?? {
    source: { owner: 'fixture', repo: 'skill', canonical: 'https://github.com/fixture/skill' },
    revision: 'main@fixture',
    skillPath: 'skills/example/SKILL.md',
    files: [{ path: 'skills/example/SKILL.md', kind: 'skill' }],
    skillContent: '# fixture',
    riskFlags: [],
  })
  const fileSystem = new FixtureFileSystemAdapter()
  const trash = new FixtureTrashAdapter()
  const config = createMemoryConfigStore(createDefaultConfig('fixture-time'))
  const ports: LifecyclePorts = { source, fileSystem, config, trash }
  return { service: createSkillLifecycleService(ports), source, fileSystem, trash, config }
}

export type FixtureConfigStore = ConfigStore & { value: ReturnType<typeof createDefaultConfig> }
