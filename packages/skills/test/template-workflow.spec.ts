import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const templatesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

describe('workflow skill templates', () => {
  it('does not instruct removed metadata-status scans or write-metadata flows', () => {
    for (const name of ['specd-metadata', 'specd-archive']) {
      const content = readFileSync(join(templatesRoot, 'skills', name, 'SKILL.md.tpl'), 'utf8')
      expect(content).not.toMatch(/specd specs list --metadata-status/)
      expect(content).not.toMatch(/generate-metadata --all --write/)
      expect(content).not.toMatch(/specd specs write-metadata/)
    }
  })

  it('optimizer agent templates gate on llmOptimizedContext', () => {
    for (const agent of ['specd-spec-context-optimizer', 'specd-project-context-optimizer']) {
      const content = readFileSync(
        join(templatesRoot, 'agents', agent, 'SPECD-AGENT.md.tpl'),
        'utf8',
      )
      expect(content).toMatch(/llmOptimizedContext/)
      if (agent === 'specd-spec-context-optimizer') {
        expect(content).toMatch(/specs optimizations/)
      }
    }
  })
})
