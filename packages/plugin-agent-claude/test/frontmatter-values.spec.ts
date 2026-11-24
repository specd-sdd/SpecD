import { describe, expect, it } from 'vitest'
import { agentFrontmatter, skillFrontmatter } from '../src/domain/frontmatter/index.js'

const SUPPORTED_KEYS = new Set([
  'name',
  'description',
  'allowed_tools',
  'argument_hint',
  'when_to_use',
  'disable_model_invocation',
  'user_invocable',
  'model',
  'effort',
  'context',
  'agent',
  'hooks',
  'paths',
  'shell',
])

const UNSUPPORTED_KEYS = ['mode', 'permission', 'temperature', 'tools', 'allowed-tools']

function keysOf(collection: Readonly<Record<string, object>>): Set<string> {
  return new Set(Object.values(collection).flatMap((entry) => Object.keys(entry)))
}

describe('plugin-agent-claude frontmatter value collections', () => {
  it('given the exported collections, when inspecting their keys, then only Claude-supported metadata appears and non-Claude keys are absent', () => {
    for (const collection of [skillFrontmatter, agentFrontmatter]) {
      const keys = keysOf(collection)
      for (const key of keys) expect(SUPPORTED_KEYS.has(key)).toBe(true)
      for (const key of UNSUPPORTED_KEYS) expect(keys.has(key)).toBe(false)
    }
  })

  it('given the exported collections, when inspecting their values, then they cover the supported metadata as structured values', () => {
    const keys = new Set([...keysOf(skillFrontmatter), ...keysOf(agentFrontmatter)])
    for (const key of ['name', 'description', 'allowed_tools', 'argument_hint']) {
      expect(keys.has(key)).toBe(true)
    }
    expect(keys.has('disable_model_invocation')).toBe(true)
    expect(skillFrontmatter['specd-fasttrack']?.disable_model_invocation).toBe(true)
    for (const entry of [...Object.values(skillFrontmatter), ...Object.values(agentFrontmatter)]) {
      expect(typeof entry).toBe('object')
      expect(entry.description.startsWith('---')).toBe(false)
    }
  })
})
