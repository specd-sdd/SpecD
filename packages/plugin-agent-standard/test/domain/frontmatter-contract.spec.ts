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
  'compatibility',
  'metadata',
  'allowed-tools',
]
const AGENT_KEYS: readonly string[] = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]

describe('Agent Skills standard domain layer', () => {
  it('given the domain layer, when inspected, then plugin type, frontmatter type and frontmatter maps exist', () => {
    expect(existsSync(join(srcDir, 'domain/types/agent-standard-plugin.ts'))).toBe(true)
    expect(existsSync(join(srcDir, 'domain/types/frontmatter.ts'))).toBe(true)
    expect(existsSync(join(srcDir, 'domain/frontmatter/index.ts'))).toBe(true)
    expect(Object.keys(skillFrontmatter).length).toBeGreaterThan(0)
    expect(agentFrontmatter).toBeDefined()
  })
})

describe('Agent Skills standard frontmatter contract', () => {
  it('given the Frontmatter type, when its keys are inspected, then they are exactly the supported set', () => {
    expectTypeOf<keyof Frontmatter>().toEqualTypeOf<
      'name' | 'description' | 'license' | 'compatibility' | 'metadata' | 'allowed-tools'
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

describe('Agent Skills standard allowed-tools configuration', () => {
  it('given every skill entry, when allowed-tools is inspected, then Bash patterns use the space style and never the colon style', () => {
    const entries = Object.entries(skillFrontmatter)
    expect(entries).toHaveLength(8)
    for (const [skill, entry] of entries) {
      const tools = entry['allowed-tools']
      expect(tools, skill).toBeTruthy()
      expect(tools, skill).toContain('Read')
      expect(tools, skill).toContain('Bash(node *)')
      expect(tools, skill).not.toMatch(/Bash\([^)]*:/)
      const patterns = tools?.match(/Bash\([^)]*\)/g) ?? []
      expect(patterns.length, skill).toBeGreaterThan(0)
      for (const pattern of patterns) {
        expect(pattern, skill).toMatch(/^Bash\([a-z]+ \*\)$/)
      }
      expect(tools, skill).not.toContain(',')
    }
  })
})
