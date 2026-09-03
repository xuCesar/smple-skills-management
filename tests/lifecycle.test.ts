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

test('fixture service exposes a stable unsupported error until an operation is implemented', async () => {
  const fixture = createLifecycleFixture()
  const target = { directory: '/fixture/skills', skillDirectoryName: 'example' }

  await assert.rejects(
    fixture.service.install({ review: await fixture.service.review({ locator: 'fixture/skill' }), target, confirmed: true }),
    (error: unknown) => error instanceof SkillLifecycleError && error.code === 'unsupported' && error.operation === 'install',
  )
})
