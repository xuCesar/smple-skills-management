import assert from 'node:assert/strict'
import test from 'node:test'
import { createLifecycleFixture } from './lifecycle.fixture.ts'
import { SkillLifecycleError } from '../src/domain/lifecycle.ts'

test('fixture service normalizes a repository locator before review', async () => {
  const fixture = createLifecycleFixture()
  const review = await fixture.service.review({ locator: 'https://github.com/acme/demo.git' })

  assert.equal(review.source.canonical, 'https://github.com/acme/demo')
  assert.deepEqual(fixture.source.reviewed[0], {
    owner: 'acme',
    repo: 'demo',
    canonical: 'https://github.com/acme/demo',
  })
  assert.equal(fixture.source.readTreeCalls, 0)
})

test('fixture service maps malformed sources to a stable lifecycle error', async () => {
  const fixture = createLifecycleFixture()

  await assert.rejects(
    fixture.service.review({ locator: 'https://github.com/acme' }),
    (error: unknown) => error instanceof SkillLifecycleError && error.code === 'invalid-source' && error.operation === 'review' && error.message === 'GitHub 来源格式不正确',
  )
})

test('fixture service installs a reviewed Skill through staging and records managed metadata', async () => {
  const fixture = createLifecycleFixture()
  const target = { directory: '/fixture/skills', skillDirectoryName: 'example' }

  const review = await fixture.service.review({ locator: 'fixture/skill' })
  const result = await fixture.service.install({ review, target, confirmed: true })
  assert.equal(result.operation, 'install')
  assert.equal(result.skillId, 'example')
  assert.deepEqual(fixture.fileSystem.replaced, [{ stagingPath: '/fixture/staging/1', target }])
  assert.deepEqual(fixture.config.value.installations, [{ skillId: 'example', path: '/fixture/skills/example', repository: 'https://github.com/fixture/skill', revision: 'main@fixture' }])
})
