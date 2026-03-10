import { describe, expect, it } from 'vitest'
import { MarkdownParser } from '../../../src/infrastructure/artifact-parser/markdown-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'

describe('MarkdownParser', () => {
  const parser = new MarkdownParser()

  describe('fileExtensions', () => {
    it('includes .md', () => {
      expect(parser.fileExtensions).toContain('.md')
    })
  })

  describe('parse — Artifact AST scenarios', () => {
    it('heading becomes section with label and level', () => {
      const ast = parser.parse('### Requirement: Login\n')
      const section = ast.root.children![0]!
      expect(section).toMatchObject({
        type: 'section',
        label: 'Requirement: Login',
        level: 3,
      })
      expect(section.children).toBeDefined()
    })

    it('section nests by heading level', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: Login\n')
      const reqSection = ast.root.children![0]!
      expect(reqSection.label).toBe('Requirements')
      expect(reqSection.level).toBe(2)
      expect(reqSection.children).toHaveLength(1)
      const loginSection = reqSection.children![0]!
      expect(loginSection.label).toBe('Requirement: Login')
      expect(loginSection.level).toBe(3)
    })

    it('non-contiguous heading levels nest correctly', () => {
      const ast = parser.parse('# Overview\n\n#### Detail\n')
      const overviewSection = ast.root.children![0]!
      expect(overviewSection.label).toBe('Overview')
      expect(overviewSection.children).toHaveLength(1)
      const detailSection = overviewSection.children![0]!
      expect(detailSection.label).toBe('Detail')
      expect(detailSection.level).toBe(4)
    })

    it('paragraph becomes leaf node with value', () => {
      const ast = parser.parse('The system must authenticate users.\n')
      const para = ast.root.children![0]!
      expect(para).toMatchObject({
        type: 'paragraph',
        value: 'The system must authenticate users.',
      })
      expect(para.children).toBeUndefined()
    })

    it('fenced code block preserves lang and content', () => {
      const ast = parser.parse('```typescript\nconst x = 1\n```\n')
      const codeBlock = ast.root.children![0]!
      expect(codeBlock).toMatchObject({
        type: 'code-block',
        label: 'typescript',
        value: 'const x = 1',
      })
    })

    it('unordered list produces list and list-item nodes', () => {
      const ast = parser.parse('- Email and password\n- Rate-limited to 5 attempts\n')
      const list = ast.root.children![0]!
      expect(list).toMatchObject({ type: 'list', ordered: false })
      expect(list.children).toHaveLength(2)
      expect(list.children![0]).toMatchObject({ type: 'list-item', label: 'Email and password' })
      expect(list.children![1]).toMatchObject({
        type: 'list-item',
        label: 'Rate-limited to 5 attempts',
      })
    })

    it('round-trip preserves structure', () => {
      const content =
        '## Requirements\n\n### Requirement: Login\n\nThe system must authenticate users.\n'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      const reparsed = parser.parse(serialized)
      expect(reparsed.root.children![0]!.label).toBe('Requirements')
      expect(reparsed.root.children![0]!.children![0]!.label).toBe('Requirement: Login')
    })
  })

  describe('apply — Delta file format scenarios', () => {
    it('modified replaces node body only (heading unchanged)', () => {
      const ast = parser.parse('### Requirement: Login\n\nOld body.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: Login' },
          content: 'New body.\n',
        },
      ])
      const section = result.root.children![0]!
      expect(section.label).toBe('Requirement: Login')
      const para = section.children![0]!
      expect(para).toMatchObject({ type: 'paragraph', value: 'New body.' })
    })

    it('modified with rename updates identifying property', () => {
      const ast = parser.parse('### Requirement: Login\n\nBody.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: Login' },
          rename: 'Requirement: Authentication',
        },
      ])
      const section = result.root.children![0]!
      expect(section.label).toBe('Requirement: Authentication')
    })

    it('rename with body update in one operation', () => {
      const ast = parser.parse('### Requirement: Login\n\nOld body.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: Login' },
          rename: 'Requirement: Authentication',
          content: 'New body.\n',
        },
      ])
      const section = result.root.children![0]!
      expect(section.label).toBe('Requirement: Authentication')
      expect(section.children![0]!).toMatchObject({ type: 'paragraph', value: 'New body.' })
    })

    it('rename collides with existing sibling → DeltaApplicationError', () => {
      const ast = parser.parse(
        '## Requirements\n\n### Requirement: Login\n\n### Requirement: Auth\n',
      )
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: Login' },
            rename: 'Requirement: Auth',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('rename on added entry is invalid → DeltaApplicationError', () => {
      const ast = parser.parse('## Requirements\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'added',
            rename: 'Should fail',
            content: '### New Section\n\nBody.\n',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('added appends when no position', () => {
      const ast = parser.parse('## Requirements\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          content: '## New Section\n\nBody.\n',
        },
      ])
      expect(result.root.children).toHaveLength(2)
      expect(result.root.children![1]!.label).toBe('New Section')
    })

    it('added with position.parent appends as last child', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'section', matches: 'Requirements' } },
          content: '### Requirement: B\n\nNew requirement.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(2)
      expect(reqs.children![1]!.label).toBe('Requirement: B')
    })

    it('added positions after matched sibling', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\n### Requirement: C\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            after: { type: 'section', matches: 'Requirement: A' },
          },
          content: '### Requirement: B\n\nInserted.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(3)
      expect(reqs.children![0]!.label).toBe('Requirement: A')
      expect(reqs.children![1]!.label).toBe('Requirement: B')
      expect(reqs.children![2]!.label).toBe('Requirement: C')
    })

    it('position.after resolves to no node → fallback to end of parent', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n')
      // Should not throw — fallback to append at end
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            after: { type: 'section', matches: 'Requirement: Deleted' },
          },
          content: '### Requirement: B\n\nFallback.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(2)
      expect(reqs.children![1]!.label).toBe('Requirement: B')
    })

    it('position.first inserts as first child', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\n### Requirement: B\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            first: true,
          },
          content: '### Requirement: New\n\nFirst.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children![0]!.label).toBe('Requirement: New')
    })

    it('position.last inserts as last child', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\n### Requirement: B\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            last: true,
          },
          content: '### Requirement: Z\n\nLast.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children![reqs.children!.length - 1]!.label).toBe('Requirement: Z')
    })

    it('position.parent resolves to no node → DeltaApplicationError', () => {
      const ast = parser.parse('## Requirements\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'added',
            position: { parent: { type: 'section', matches: 'Nonexistent' } },
            content: '### New\n\nBody.\n',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('removed detaches a section', () => {
      const ast = parser.parse(
        '## Requirements\n\n### Requirement: Login\n\n### Requirement: Logout\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'section', matches: 'Requirement: Logout' },
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(1)
      expect(reqs.children![0]!.label).toBe('Requirement: Login')
    })

    it('entries applied in declaration order', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\n### Requirement: B\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: A' },
          rename: 'Requirement: Alpha',
        },
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: B' },
          rename: 'Requirement: Beta',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children![0]!.label).toBe('Requirement: Alpha')
      expect(reqs.children![1]!.label).toBe('Requirement: Beta')
    })

    it('removed followed by added at same position', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\n### Requirement: B\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'section', matches: 'Requirement: B' },
        },
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            after: { type: 'section', matches: 'Requirement: A' },
          },
          content: '### Requirement: C\n\nNew.\n',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(2)
      expect(reqs.children![0]!.label).toBe('Requirement: A')
      expect(reqs.children![1]!.label).toBe('Requirement: C')
    })

    it('entire delta rejected on single selector failure', () => {
      const ast = parser.parse(
        '## Requirements\n\n### Requirement: A\n\n### Requirement: B\n\n### Requirement: C\n',
      )
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: A' },
            rename: 'Alpha',
          },
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: Nonexistent' },
            rename: 'Nope',
          },
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: C' },
            rename: 'Gamma',
          },
        ]),
      ).toThrow(DeltaApplicationError)

      // Verify original AST is not modified (we got a new AST from apply)
      const original = ast.root.children![0]!
      expect(original.children![0]!.label).toBe('Requirement: A')
    })
  })

  describe('nodeTypes', () => {
    it('returns vocabulary including section, paragraph, list, list-item, code-block', () => {
      const types = parser.nodeTypes()
      const typeNames = types.map((t) => t.type)
      expect(typeNames).toContain('section')
      expect(typeNames).toContain('paragraph')
      expect(typeNames).toContain('list')
      expect(typeNames).toContain('list-item')
      expect(typeNames).toContain('code-block')
    })
  })

  describe('deltaInstructions', () => {
    it('returns non-empty string', () => {
      const instructions = parser.deltaInstructions()
      expect(typeof instructions).toBe('string')
      expect(instructions.length).toBeGreaterThan(0)
    })
  })

  describe('outline', () => {
    it('reflects section nodes with correct labels', () => {
      const ast = parser.parse(
        '## Requirements\n\n### Requirement: Login\n\n### Requirement: Logout\n\n### Requirement: Remember me\n',
      )
      const outline = parser.outline(ast)
      // Outline should include sections
      const allLabels = flattenOutlineLabels(outline)
      expect(allLabels).toContain('Requirements')
      expect(allLabels).toContain('Requirement: Login')
      expect(allLabels).toContain('Requirement: Logout')
      expect(allLabels).toContain('Requirement: Remember me')
    })
  })

  describe('selector model scenarios', () => {
    it('matches: plain string acts as regex (substring match)', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: Load config\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Requirement: Load' },
          rename: 'Requirement: Load configuration',
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children![0]!.label).toBe('Requirement: Load configuration')
    })

    it('matches: anchored regex', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: Login\n\n### Auth: Other\n')
      // Anchored selector should only match the one starting with 'Requirement:'
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'section', matches: '^Requirement:' },
        },
      ])
      const reqs = result.root.children![0]!
      expect(reqs.children).toHaveLength(1)
      expect(reqs.children![0]!.label).toBe('Auth: Other')
    })

    it('parent narrows search to descendants', () => {
      const ast = parser.parse(
        '## Requirements\n\n### Requirement: Login\n\n## Constraints\n\n### Requirement: Login\n',
      )
      // Both sections have label "Requirement: Login" — use parent to disambiguate
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: {
            type: 'section',
            matches: '^Requirement: Login$',
            parent: { type: 'section', matches: '^Requirements$' },
          },
          rename: 'Requirement: Authentication',
        },
      ])
      const requirementsSection = result.root.children![0]!
      const constraintsSection = result.root.children![1]!
      expect(requirementsSection.children![0]!.label).toBe('Requirement: Authentication')
      expect(constraintsSection.children![0]!.label).toBe('Requirement: Login')
    })

    it('two entries targeting the same node → DeltaApplicationError', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: Login\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: Login' },
            rename: 'Alpha',
          },
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: Login' },
            rename: 'Beta',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('selector.index and selector.where mutually exclusive → DeltaApplicationError', () => {
      const ast = parser.parse('## Items\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'removed',
            selector: { type: 'section', matches: 'Items', index: 0, where: { key: 'val' } },
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('contains matches node value (paragraph)', () => {
      const ast = parser.parse('The system SHALL authenticate users.\n\nOther paragraph.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'paragraph', contains: 'SHALL authenticate' },
        },
      ])
      expect(result.root.children).toHaveLength(1)
      expect(result.root.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Other paragraph.',
      })
    })
  })

  describe('strategy scenarios', () => {
    it('strategy: append on non-array node → DeltaApplicationError', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirement: A' },
            strategy: 'append',
            value: 'something',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('strategy: merge-by without mergeKey → DeltaApplicationError', () => {
      const ast = parser.parse('## Requirements\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'section', matches: 'Requirements' },
            strategy: 'merge-by',
            value: 'something',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })
  })
})

function flattenOutlineLabels(
  entries: readonly { label: string; children?: readonly { label: string }[] }[],
): string[] {
  const labels: string[] = []
  for (const entry of entries) {
    labels.push(entry.label)
    if (entry.children) {
      labels.push(...flattenOutlineLabels(entry.children))
    }
  }
  return labels
}
