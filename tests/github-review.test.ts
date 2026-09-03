import assert from 'node:assert/strict'
import test from 'node:test'
import { createPublicGitHubSourceAdapter, PublicGitHubSourceError, parsePublicRepository, type FetchLike } from '../src/domain/github.ts'

function response(payload: unknown, ok = true): Awaited<ReturnType<FetchLike>> {
  return { ok, status: ok ? 200 : 404, json: async () => payload, text: async () => JSON.stringify(payload) }
}

function createFetch(entries: Array<Record<string, unknown>>, revision = 'abc123'): FetchLike {
  return async (url) => {
    if (url.includes('/commits/')) return response({ sha: revision })
    if (url.includes('/git/trees/')) return response({ tree: entries })
    const entry = entries.find((candidate) => candidate.url === url)
    if (!entry) return response({}, false)
    const content = Buffer.from(String(entry.content ?? '')).toString('base64')
    return response({ content, encoding: 'base64' })
  }
}

test('parses public GitHub locator and optional ref without network access', () => {
  assert.deepEqual(parsePublicRepository('https://github.com/acme/demo@v1.2.0.git'), {
    owner: 'acme',
    repo: 'demo',
    ref: 'v1.2.0',
    canonical: 'https://github.com/acme/demo',
  })
  assert.throws(() => parsePublicRepository('https://github.com/acme/demo/tree/main/skill'), /GitHub HTTPS/)
  assert.throws(() => parsePublicRepository('http://github.com/acme/demo'), /GitHub HTTPS/)
})

test('reviews nested resources for a repository-root Skill', async () => {
  const entries = [
    { path: 'SKILL.md', type: 'blob', mode: '100644', url: 'blob:skill', content: '# Root skill' },
    { path: 'references/guide.md', type: 'blob', mode: '100644', url: 'blob:guide', content: 'guide' },
  ]
  const review = await createPublicGitHubSourceAdapter(createFetch(entries)).review(parsePublicRepository('acme/demo'))
  assert.deepEqual(review.files.map((file) => file.path), ['SKILL.md', 'references/guide.md'])
})

test('rejects a truncated GitHub tree because the review would be incomplete', async () => {
  const fetchImpl: FetchLike = async (url) => {
    if (url.includes('/commits/')) return response({ sha: 'abc123' })
    return response({ tree: [], truncated: true })
  }
  const adapter = createPublicGitHubSourceAdapter(fetchImpl)
  await assert.rejects(adapter.review(parsePublicRepository('acme/demo')), (error: unknown) => error instanceof PublicGitHubSourceError && error.code === 'source-unavailable')
})

test('reviews complete selected Skill subtree and records revision and risks', async () => {
  const entries = [
    { path: 'skills/demo', type: 'tree', mode: '040000' },
    { path: 'skills/demo/SKILL.md', type: 'blob', mode: '100644', url: 'blob:skill', content: '# Demo skill' },
    { path: 'skills/demo/README.md', type: 'blob', mode: '100644', url: 'blob:readme', content: 'docs' },
    { path: 'skills/demo/run.sh', type: 'blob', mode: '100755', url: 'blob:script', content: '#!/bin/sh' },
  ]
  const adapter = createPublicGitHubSourceAdapter(createFetch(entries, 'deadbeef'))
  const review = await adapter.review(parsePublicRepository('acme/demo'), 'skills/demo/SKILL.md')
  assert.equal(review.revision, 'deadbeef')
  assert.equal(review.skillPath, 'SKILL.md')
  assert.deepEqual(review.availableSkillPaths, ['SKILL.md'])
  assert.deepEqual(review.files.map((file) => [file.path, file.kind]), [
    ['SKILL.md', 'skill'],
    ['README.md', 'file'],
    ['run.sh', 'executable'],
  ])
  assert.equal(review.skillContent, '# Demo skill')
  assert.equal(review.riskFlags.length, 1)
})

test('requires explicit selection when repository has multiple nested Skills', async () => {
  const entries = [
    { path: 'a/SKILL.md', type: 'blob', mode: '100644', url: 'blob:a', content: '# A' },
    { path: 'b/SKILL.md', type: 'blob', mode: '100644', url: 'blob:b', content: '# B' },
  ]
  const adapter = createPublicGitHubSourceAdapter(createFetch(entries))
  await assert.rejects(adapter.review(parsePublicRepository('acme/demo')), (error: unknown) => error instanceof PublicGitHubSourceError && error.code === 'multiple-skills')
  const review = await adapter.review(parsePublicRepository('acme/demo'), 'b/SKILL.md')
  assert.equal(review.skillContent, '# B')
})

test('rejects traversal and escaping symlink entries without executing source', async () => {
  const traversal = [{ path: 'demo/../SKILL.md', type: 'blob', mode: '100644', url: 'blob:bad', content: '# bad' }]
  const adapter = createPublicGitHubSourceAdapter(createFetch(traversal))
  await assert.rejects(adapter.review(parsePublicRepository('acme/demo')), (error: unknown) => error instanceof PublicGitHubSourceError && error.code === 'unsafe-source')

  const symlink = [
    { path: 'demo/SKILL.md', type: 'blob', mode: '100644', url: 'blob:skill', content: '# demo' },
    { path: 'demo/link', type: 'blob', mode: '120000', url: 'blob:link', content: '../../outside' },
  ]
  const symlinkAdapter = createPublicGitHubSourceAdapter(createFetch(symlink))
  await assert.rejects(symlinkAdapter.review(parsePublicRepository('acme/demo')), (error: unknown) => error instanceof PublicGitHubSourceError && error.code === 'unsafe-source')
})
