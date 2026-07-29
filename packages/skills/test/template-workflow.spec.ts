import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const templatesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

function readTemplate(...parts: string[]): string {
  return readFileSync(join(templatesRoot, ...parts), 'utf8')
}

describe('workflow skill templates', () => {
  it('does not instruct removed metadata-status scans or write-metadata flows', () => {
    const content = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(content).not.toMatch(/specd specs list --metadata-status/)
    expect(content).not.toMatch(/generate-metadata --all --write/)
    expect(content).not.toMatch(/specd specs write-metadata/)
  })

  it('optimizer agent templates use the top-level project status gate', () => {
    for (const agent of ['specd-spec-context-optimizer', 'specd-project-context-optimizer']) {
      const content = readTemplate('agents', agent, 'SPECD-AGENT.md.tpl')
      expect(content).toContain('specd project status --format toon')
      expect(content).toContain('top-level `llmOptimizedContext` field')
      expect(content).not.toContain('specd specs metadata <spec-id> --format json')
    }
  })

  it('spec optimizer template uses direct persistence options without mixed forms or metadata regeneration', () => {
    const content = readTemplate('agents', 'specd-spec-context-optimizer', 'SPECD-AGENT.md.tpl')
    expect(content).toContain(
      'specd specs optimizations set <spec-id> --optimized-description "<punchy sentence>" --optimized-context "<optimized Markdown>"',
    )
    expect(content).toContain('You MAY omit one direct option when only one field needs refresh.')
    expect(content).toContain('Do not combine either direct option with `--input`.')
    expect(content).toContain('Do **not** run `specd specs generate-metadata` afterward')
  })

  it('project optimizer template retains project-scoped persistence', () => {
    const content = readTemplate('agents', 'specd-project-context-optimizer', 'SPECD-AGENT.md.tpl')
    expect(content).toContain('specd project status --format toon')
    expect(content).toContain('top-level `llmOptimizedContext` field')
    expect(content).toContain('specd project update-metadata --optimized-context')
    expect(content).not.toContain('specd specs optimizations set')
    expect(content).toContain('Do **not** run routine `specd specs generate-metadata`')
  })

  it('shared guidance defines exact show/context/metadata roles', () => {
    const content = readTemplate('shared', 'shared.md.tpl')
    expect(content).toContain('`specd specs show <spec-id>` for exact raw artifact content')
    expect(content).toContain(
      '`specd specs context <spec-id>` for semantic working context, including section filtering, dependency traversal, and optimized-content preference.',
    )
    expect(content).toContain(
      '`specd specs metadata <spec-id>` only for the normalized metadata projection and materialization diagnostics such as `source`, `regenerated`, and warnings.',
    )
    expect(content).toContain(
      'Do not treat `specd specs metadata` as the default context-loading command or as a source of effective project configuration.',
    )
  })

  it('archive guidance keeps metadata diagnostics separate from optimization gating', () => {
    const content = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(content).toContain('specd specs metadata <spec-id> --format json')
    expect(content).toContain('contains top-level `llmOptimizedContext`')
    expect(content).toContain('If top-level `llmOptimizedContext` is `true`')
    expect(content).not.toContain('approvals.llmOptimized')
  })
})
