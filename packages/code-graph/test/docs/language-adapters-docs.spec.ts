import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CORE_MEMBERS,
  FACET_MEMBERS,
} from '../../src/infrastructure/tree-sitter/adapter-registry.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const guide = readFileSync(join(repoRoot, 'docs/code-graph/language-adapters.md'), 'utf8')

describe('docs/code-graph/language-adapters.md', () => {
  it('Given the adapter contract, when the guide is read, then it documents every core member', () => {
    for (const member of CORE_MEMBERS) {
      expect({
        member,
        documented: guide.includes(`\`${member}(`) || guide.includes(`\`${member}\``),
      }).toEqual({
        member,
        documented: true,
      })
    }
  })

  it('Given the facet table, when the guide is read, then every facet and every member is documented', () => {
    for (const [facet, members] of Object.entries(FACET_MEMBERS)) {
      expect({ facet, documented: guide.includes(`### \`${facet}\``) }).toEqual({
        facet,
        documented: true,
      })
      for (const member of members) {
        expect({ facet, member, documented: guide.includes(`\`${member}(`) }).toEqual({
          facet,
          member,
          documented: true,
        })
      }
    }
  })

  it('Given the unresolved reasons, when the guide is read, then each reason is explained', () => {
    for (const reason of [
      'facet-absent',
      'package-unknown',
      'no-entry-surface',
      'not-exported',
      'ambiguous',
    ]) {
      expect({ reason, documented: guide.includes(`\`${reason}\``) }).toEqual({
        reason,
        documented: true,
      })
    }
  })

  it('Given the registration error, when the guide is read, then its code is documented', () => {
    expect(guide).toContain('INVALID_LANGUAGE_ADAPTER')
  })
})
