import { describe, expect, it } from 'vitest'
import type { GetProjectContextResult } from '@specd/core'
import { projectContextToMarkdown } from '../../src/presentation/project-context-to-markdown.js'

describe('projectContextToMarkdown', () => {
  it('returns no project context configured when empty', () => {
    const context: GetProjectContextResult = {
      contextEntries: [],
      specs: [],
      warnings: [],
    }

    const output = projectContextToMarkdown(context)
    expect(output).toBe('no project context configured')
  })

  it('renders context entries, full specs, and specs context hint for catalogue specs', () => {
    const context: GetProjectContextResult = {
      contextEntries: ['Entry 1: Project overview', 'Entry 2: Constraints'],
      specs: [
        {
          specId: 'core:full-spec',
          mode: 'full',
          source: 'includePattern',
          content: 'Full spec content here.',
        },
        {
          specId: 'cli:summary-spec',
          mode: 'summary',
          source: 'includePattern',
          title: 'Summary Title',
          description: 'Summary Description',
        },
      ],
      warnings: [],
    }

    const output = projectContextToMarkdown(context)

    expect(output).toContain('Entry 1: Project overview')
    expect(output).toContain('Entry 2: Constraints')
    expect(output).toContain(
      '## Spec content\n\n### Spec: core:full-spec\nMode: full\n\nFull spec content here.',
    )
    expect(output).toContain('## Available context specs')
    expect(output).toContain(
      'Use `specd specs context <specId>` to load the full optimized context of any listed spec.',
    )
    expect(output).toContain('| cli:summary-spec | summary | Summary Title | Summary Description |')
    expect(output).not.toContain('spec-preview')
  })

  it('never mentions spec-preview even if catalogue entries exist', () => {
    const context: GetProjectContextResult = {
      contextEntries: [],
      specs: [
        {
          specId: 'core:some-spec',
          mode: 'summary',
          source: 'includePattern',
          title: 'Some Title',
          description: 'Some Desc',
        },
      ],
      warnings: [],
    }

    const output = projectContextToMarkdown(context)
    expect(output).not.toContain('spec-preview')
  })

  it('renders list mode table without title and description columns', () => {
    const context: GetProjectContextResult = {
      contextEntries: [],
      specs: [
        {
          specId: 'core:list-spec',
          mode: 'list',
          source: 'includePattern',
        },
      ],
      warnings: [],
    }

    const output = projectContextToMarkdown(context)
    expect(output).toContain('| Spec ID | Mode |')
    expect(output).not.toContain('| Title | Description |')
    expect(output).toContain('| core:list-spec | list |')
  })
})
