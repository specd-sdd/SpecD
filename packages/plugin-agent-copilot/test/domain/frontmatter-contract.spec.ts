import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { agentFrontmatter, skillFrontmatter } from '../../src/domain/frontmatter/index.js'
import type { Frontmatter } from '../../src/domain/types/frontmatter.js'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../../src')

const SKILL_KEYS: readonly string[] = [
  'name',
  'description',
  'license',
  'allowed-tools',
  'user-invocable',
  'disable-model-invocation',
]
const AGENT_KEYS: readonly string[] = [
  'name',
  'description',
  'license',
  'allowed-tools',
  'user-invocable',
  'disable-model-invocation',
]

describe('Copilot domain layer', () => {
  it('given the domain layer, when inspected, then plugin type, frontmatter type and frontmatter maps exist', () => {
    expect(existsSync(join(srcDir, 'domain/types/copilot-plugin.ts'))).toBe(true)
    expect(existsSync(join(srcDir, 'domain/types/frontmatter.ts'))).toBe(true)
    expect(existsSync(join(srcDir, 'domain/frontmatter/index.ts'))).toBe(true)
    expect(Object.keys(skillFrontmatter).length).toBeGreaterThan(0)
    expect(agentFrontmatter).toBeDefined()
  })
})

describe('Copilot frontmatter contract', () => {
  it('given the Frontmatter type, when its keys are inspected, then they are exactly the supported set', () => {
    expectTypeOf<keyof Frontmatter>().toEqualTypeOf<
      | 'name'
      | 'description'
      | 'license'
      | 'allowed-tools'
      | 'user-invocable'
      | 'disable-model-invocation'
    >()
  })

  it('given an unsupported key, when proposed for the Frontmatter type, then it is rejected at type level', () => {
    // @ts-expect-error unsupported keys are not part of the frontmatter value model
    const invalid: Frontmatter = { name: 'x', description: 'y', unsupportedKey: true }
    expect(invalid.description).toBe('y')
  })

  it('given every skill entry, when its keys are inspected, then only supported keys are represented', () => {
    for (const [skill, entry] of Object.entries(skillFrontmatter)) {
      for (const key of Object.keys(entry)) {
        expect(SKILL_KEYS, `${skill}.${key}`).toContain(key)
      }
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('given every agent entry, when its keys are inspected, then only supported keys are represented', () => {
    for (const [agent, entry] of Object.entries(agentFrontmatter)) {
      for (const key of Object.keys(entry)) {
        expect(AGENT_KEYS, `${agent}.${key}`).toContain(key)
      }
    }
  })
})
