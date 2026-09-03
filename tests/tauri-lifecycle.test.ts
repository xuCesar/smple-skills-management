import assert from 'node:assert/strict'
import test from 'node:test'
import { installReviewedSkill, reviewLifecycleSource } from '../src/domain/tauri-lifecycle.ts'

test('Tauri lifecycle facade validates review responses', async () => {
  const original = (globalThis as { __TAURI__?: unknown }).__TAURI__
  ;(globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: async () => ({ reviewId: 'r1', source: 'https://github.com/acme/demo', revision: 'abc', skillPath: 'SKILL.md', skillId: 'demo', files: [{ path: 'SKILL.md', kind: 'skill' }], skillContent: '# Demo', riskFlags: [], availableSkillPaths: ['SKILL.md'] }) } }
  try {
    assert.equal((await reviewLifecycleSource('acme/demo')).reviewId, 'r1')
  } finally {
    ;(globalThis as { __TAURI__?: unknown }).__TAURI__ = original
  }
})

test('Tauri lifecycle facade rejects malformed mutation responses', async () => {
  const original = (globalThis as { __TAURI__?: unknown }).__TAURI__
  ;(globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: async () => ({ operation: 'install' }) } }
  try {
    await assert.rejects(installReviewedSkill('r1', '~/.agents/skills', 'demo', true), /数据格式无效/)
  } finally {
    ;(globalThis as { __TAURI__?: unknown }).__TAURI__ = original
  }
})
