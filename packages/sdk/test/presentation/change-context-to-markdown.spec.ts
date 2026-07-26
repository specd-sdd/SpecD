import { describe, expect, it } from 'vitest'
import type { CompileContextResult } from '@specd/core'
import { changeContextToMarkdown } from '../../src/presentation/change-context-to-markdown.js'

describe('changeContextToMarkdown', () => {
  it('returns unchanged message and fingerprint when status is unchanged', () => {
    const context: CompileContextResult = {
      contextFingerprint: 'abc123hash',
      status: 'unchanged',
      projectContext: [],
      specs: [],
      warnings: [],
    }

    const output = changeContextToMarkdown(context, { changeName: 'test-change' })
    expect(output).toBe('Context Fingerprint: abc123hash\n\nContext unchanged since last call.')
  })

  it('omits fingerprint when includeFingerprint is false on unchanged status', () => {
    const context: CompileContextResult = {
      contextFingerprint: 'abc123hash',
      status: 'unchanged',
      projectContext: [],
      specs: [],
      warnings: [],
    }

    const output = changeContextToMarkdown(context, {
      changeName: 'test-change',
      includeFingerprint: false,
    })
    expect(output).toBe('Context unchanged since last call.')
  })

  it('renders project context, full specs, and partitioned catalogue hints when changed', () => {
    const context: CompileContextResult = {
      contextFingerprint: 'hash999',
      status: 'changed',
      projectContext: [
        {
          source: 'file',
          path: '.specd/rules.md',
          content: 'Rule 1: Be rigorous.',
        },
        {
          source: 'instruction',
          content: 'Follow design.',
        },
      ],
      specs: [
        {
          specId: 'core:full-spec',
          mode: 'full',
          source: 'specIds',
          content: '# Full Spec Content',
        },
        {
          specId: 'cli:change-spec',
          mode: 'summary',
          source: 'specIds',
          title: 'Change Spec Title',
          description: 'Change Spec Desc',
        },
        {
          specId: 'core:pattern-spec',
          mode: 'summary',
          source: 'includePattern',
          title: 'Pattern Spec Title',
          description: 'Pattern Spec Desc',
        },
        {
          specId: 'core:dep-spec',
          mode: 'summary',
          source: 'dependsOnTraversal',
          title: 'Dep Spec Title',
          description: 'Dep Spec Desc',
        },
      ],
      warnings: [],
    }

    const output = changeContextToMarkdown(context, { changeName: 'my-change' })

    expect(output).toContain('Context Fingerprint: hash999')
    expect(output).toContain('**Source: .specd/rules.md**\n\nRule 1: Be rigorous.')
    expect(output).toContain('**Source: instruction**\n\nFollow design.')
    expect(output).toContain(
      '## Spec content\n\n### Spec: core:full-spec\nMode: full\n\n# Full Spec Content',
    )

    expect(output).toContain('## Available context specs')
    expect(output).toContain(
      'Use `specd changes spec-preview my-change <specId>` to load the merged full content of any change spec you need.',
    )
    expect(output).toContain(
      'Use `specd specs context <specId>` to load the full optimized context of any listed spec.',
    )
    expect(output).toContain('### Via dependencies')

    // Table rows
    expect(output).toContain(
      '| cli:change-spec | summary | specIds | Change Spec Title | Change Spec Desc |',
    )
    expect(output).toContain(
      '| core:pattern-spec | summary | includePattern | Pattern Spec Title | Pattern Spec Desc |',
    )
    expect(output).toContain(
      '| core:dep-spec | summary | dependsOnTraversal | Dep Spec Title | Dep Spec Desc |',
    )
  })

  it('omits spec-preview prose when specIds group is empty', () => {
    const context: CompileContextResult = {
      contextFingerprint: 'hash111',
      status: 'changed',
      projectContext: [],
      specs: [
        {
          specId: 'core:dep-spec',
          mode: 'summary',
          source: 'dependsOnTraversal',
          title: 'Dep Spec Title',
          description: 'Dep Spec Desc',
        },
      ],
      warnings: [],
    }

    const output = changeContextToMarkdown(context, { changeName: 'my-change' })

    expect(output).not.toContain('spec-preview')
    expect(output).toContain(
      'Use `specd specs context <specId>` to load the full optimized context of any listed spec.',
    )
    expect(output).toContain('### Via dependencies')
  })

  it('renders list mode tables with reduced columns', () => {
    const context: CompileContextResult = {
      contextFingerprint: 'hash222',
      status: 'changed',
      projectContext: [],
      specs: [
        {
          specId: 'cli:list-spec',
          mode: 'list',
          source: 'specIds',
        },
      ],
      warnings: [],
    }

    const output = changeContextToMarkdown(context, { changeName: 'my-change' })
    expect(output).toContain('| Spec ID | Mode | Source |')
    expect(output).not.toContain('| Title | Description |')
    expect(output).toContain('| cli:list-spec | list | specIds |')
  })
})
