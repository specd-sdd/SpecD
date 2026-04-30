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

    it('preserves ordered list start marker on round-trip', () => {
      const content = '3. Third item\n4. Fourth item\n'
      const ast = parser.parse(content)
      const list = ast.root.children![0]!
      expect(list).toMatchObject({ type: 'list', ordered: true, start: 3 })

      const serialized = parser.serialize(ast)
      expect(serialized).toContain('3. Third item')
      expect(serialized).toContain('4. Fourth item')
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

    it('preserves source style when unambiguous', () => {
      const content = '- item a\n- item b\n\nUse _emphasis_ and __strong__.\n'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      expect(serialized).toContain('- item a')
      expect(serialized).toContain('_emphasis_')
      expect(serialized).toContain('__strong__')
    })

    it('uses deterministic fallback style when source style is mixed', () => {
      const content = '- item a\n* item b\n\nUse _one_ and *two*.\nUse __three__ and **four**.\n'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      expect(serialized).toContain('- item a')
      expect(serialized).toContain('- item b')
      expect(serialized).not.toContain('* item b')
      expect(serialized).toContain('*one*')
      expect(serialized).toContain('**three**')
    })

    it('preserves thematic break marker when source is unambiguous', () => {
      const content = 'Before\n\n---\n\nAfter\n'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      expect(serialized).toContain('\n---\n')
      expect(serialized).not.toContain('\n***\n')
    })

    it('preserves blockquote shape without escaping marker text', () => {
      const content = '> ⚠ Warning: keep this as blockquote.\n'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      expect(serialized).toContain('> ⚠ Warning: keep this as blockquote.')
      expect(serialized).not.toContain('\\>')
    })

    it('normalizes adjacent unordered lists to deterministic fallback bullet', () => {
      const ast = {
        root: {
          type: 'document',
          _markdownStyle: { bullet: '-', emphasis: '*', strong: '*', rule: '-' },
          children: [
            {
              type: 'list',
              ordered: false,
              children: [{ type: 'list-item', label: 'first list item' }],
            },
            {
              type: 'list',
              ordered: false,
              children: [{ type: 'list-item', label: 'second list item' }],
            },
          ],
        },
      }
      const serialized = parser.serialize(ast)
      expect(serialized).toContain('- first list item')
      expect(serialized).toContain('- second list item')
      expect(serialized).not.toContain('* second list item')
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
      const section = result.ast.root.children![0]!
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
      const section = result.ast.root.children![0]!
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
      const section = result.ast.root.children![0]!
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
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![1]!.label).toBe('New Section')
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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

    it('preserves untouched inline code formatting after modifying another section', () => {
      const ast = parser.parse(
        '## Requirement: Unchanged\n\nUse `specd change validate <name>`.\n\n## Requirement: Target\n\nOld text.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: '^Requirement: Target$' },
          content: 'New text.\n',
        },
      ])

      const serialized = parser.serialize(result.ast)
      expect(serialized).toContain('`specd change validate <name>`')
      expect(serialized).not.toContain('\\<name\\>')
    })

    it('preserves untouched thematic break marker after modifying another section', () => {
      const ast = parser.parse(
        '## Requirement: Unchanged\n\nBefore\n\n---\n\nAfter\n\n## Requirement: Target\n\nOld text.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: '^Requirement: Target$' },
          content: 'New text.\n',
        },
      ])
      const serialized = parser.serialize(result.ast)
      expect(serialized).toContain('\n---\n')
      expect(serialized).not.toContain('\n***\n')
    })

    it('preserves untouched blockquote markers after modifying another section', () => {
      const ast = parser.parse(
        '## Requirement: Unchanged\n\n> Warning line\n\n## Requirement: Target\n\nOld text.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: '^Requirement: Target$' },
          content: 'New text.\n',
        },
      ])

      const serialized = parser.serialize(result.ast)
      expect(serialized).toContain('> Warning line')
      expect(serialized).not.toContain('\\> Warning line')
    })

    it('preserves untouched ordered list numbering after modifying another section', () => {
      const ast = parser.parse(
        '## Requirement: Unchanged\n\n3. Keep as three\n4. Keep as four\n\n## Requirement: Target\n\nOld text.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: '^Requirement: Target$' },
          content: 'New text.\n',
        },
      ])
      const serialized = parser.serialize(result.ast)
      expect(serialized).toContain('3. Keep as three')
      expect(serialized).toContain('4. Keep as four')
      expect(serialized).not.toContain('1. Keep as three')
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

    it('keeps default outline limited to section entries', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: Login\n')
      const outline = parser.outline(ast)
      const req = flattenOutlineEntries(outline).find((e) => e.label === 'Requirement: Login')
      expect(req?.type).toBe('section')
      expect(flattenOutlineEntries(outline).some((e) => e.type === 'paragraph')).toBe(false)
    })

    it('returns broader families in full mode', () => {
      const ast = parser.parse('## Requirements\n\nParagraph text.\n')
      const outline = parser.outline(ast, { full: true })
      expect(flattenOutlineEntries(outline).some((e) => e.type === 'paragraph')).toBe(true)
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
      const reqs = result.ast.root.children![0]!
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
      const reqs = result.ast.root.children![0]!
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
      const requirementsSection = result.ast.root.children![0]!
      const constraintsSection = result.ast.root.children![1]!
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
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Other paragraph.',
      })
    })

    it('paragraph modified with unique selector replaces only target paragraph', () => {
      const ast = parser.parse(
        '## Requirement: Target section\n\nParagraph with unique marker.\n\n## Requirement: Other section\n\nParagraph that must remain unchanged.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'paragraph', contains: 'unique marker' },
          value: 'Replacement paragraph text.',
        },
      ])

      const targetSection = result.ast.root.children![0]!
      const otherSection = result.ast.root.children![1]!
      expect(targetSection.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Replacement paragraph text.',
      })
      expect(otherSection.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Paragraph that must remain unchanged.',
      })
    })

    it('paragraph modified with ambiguous selector fails atomically', () => {
      const ast = parser.parse(
        '## Requirement: A\n\nShared paragraph text.\n\n## Requirement: B\n\nShared paragraph text.\n',
      )
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'paragraph', contains: '^Shared paragraph text\\.$' },
            content: 'Should not be applied.\n',
          },
        ]),
      ).toThrow(DeltaApplicationError)

      const sectionA = ast.root.children![0]!
      const sectionB = ast.root.children![1]!
      expect(sectionA.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Shared paragraph text.',
      })
      expect(sectionB.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Shared paragraph text.',
      })
    })

    it('paragraph modified with parent selector resolves ambiguity', () => {
      const ast = parser.parse(
        '## Requirement: Target section\n\nShared paragraph text.\n\n## Requirement: Other section\n\nShared paragraph text.\n',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: {
            type: 'paragraph',
            contains: '^Shared paragraph text\\.$',
            parent: { type: 'section', matches: '^Requirement: Target section$' },
          },
          value: 'Scoped replacement text.',
        },
      ])

      const targetSection = result.ast.root.children![0]!
      const otherSection = result.ast.root.children![1]!
      expect(targetSection.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Scoped replacement text.',
      })
      expect(otherSection.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'Shared paragraph text.',
      })
    })
  })

  describe('apply — added operation for all node types', () => {
    it('added section with parent.after placement', () => {
      const ast = parser.parse('## Requirements\n\n### Requirement: A\n\nBody A.\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            parent: { type: 'section', matches: 'Requirements' },
            after: { type: 'section', matches: 'Requirement: A' },
          },
          content: '### Requirement: B\n\nBody B.\n',
        },
      ])
      const reqs = result.ast.root.children![0]!
      expect(reqs.children).toHaveLength(2)
      expect(reqs.children![0]!.label).toBe('Requirement: A')
      expect(reqs.children![1]!.label).toBe('Requirement: B')
    })

    it('added list as child of section via position.parent', () => {
      const ast = parser.parse('## Section\n\nParagraph.\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'section', matches: 'Section' } },
          content: '- Item one\n- Item two\n',
        },
      ])
      const section = result.ast.root.children![0]!
      expect(section.children).toHaveLength(2)
      expect(section.children![1]!.type).toBe('list')
      expect(section.children![1]!.children).toHaveLength(2)
    })

    it('added code-block at document root', () => {
      const ast = parser.parse('Existing paragraph.\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          content: '```ts\nconsole.log("hello")\n```\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![1]!.type).toBe('code-block')
      expect(result.ast.root.children![1]!.value).toBe('console.log("hello")')
    })

    it('added list-item via content under existing list', () => {
      const ast = parser.parse('- Alpha\n- Beta\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'list' } },
          content: '- Gamma\n',
        },
      ])
      const list = result.ast.root.children![0]!
      expect(list.type).toBe('list')
      expect(list.children).toHaveLength(3)
      expect(list.children![2]!.type).toBe('list-item')
      expect(list.children![2]!.label).toBe('Gamma')
    })

    it('added thematic-break between sections', () => {
      const ast = parser.parse('## A\n\n## B\n')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: {
            after: { type: 'section', matches: '^A$' },
          },
          content: '---\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(3)
      expect(result.ast.root.children![1]!.type).toBe('thematic-break')
      expect(result.ast.root.children![0]!.label).toBe('A')
      expect(result.ast.root.children![2]!.label).toBe('B')
    })
  })

  describe('apply — modified operation for all node types', () => {
    it('modified document replaces root children', () => {
      const ast = parser.parse('## Old\n\nOld body.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'document' },
          content: '## New\n\nNew body.\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!.label).toBe('New')
    })

    it('modified section replaces body only', () => {
      const ast = parser.parse('## Section\n\nOld body.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: 'Section' },
          content: 'New body.\n',
        },
      ])
      const section = result.ast.root.children![0]!
      expect(section.label).toBe('Section')
      expect(section.children![0]!).toMatchObject({ type: 'paragraph', value: 'New body.' })
    })

    it('modified paragraph replaces value via value', () => {
      const ast = parser.parse('## S\n\nOld paragraph text.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'paragraph', contains: 'Old paragraph' },
          value: 'New paragraph text.',
        },
      ])
      const section = result.ast.root.children![0]!
      expect(section.children![0]!).toMatchObject({
        type: 'paragraph',
        value: 'New paragraph text.',
      })
    })

    it('modified list replaces children', () => {
      const ast = parser.parse('- Old A\n- Old B\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'list' },
          content: '- New X\n',
        },
      ])
      const list = result.ast.root.children![0]!
      expect(list.type).toBe('list')
      expect(list.children).toHaveLength(1)
      expect(list.children![0]!).toMatchObject({ type: 'list-item', label: 'New X' })
    })

    it('modified list-item via rename updates label', () => {
      const ast = parser.parse('- Alpha\n- Beta\n- Gamma\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'list-item', matches: 'Beta' },
          rename: 'Replaced Beta',
        },
      ])
      const list = result.ast.root.children![0]!
      expect(list.children![0]!).toMatchObject({ type: 'list-item', label: 'Alpha' })
      expect(list.children![1]!).toMatchObject({ type: 'list-item', label: 'Replaced Beta' })
      expect(list.children![2]!).toMatchObject({ type: 'list-item', label: 'Gamma' })
    })

    it('modified code-block replaces value via value', () => {
      const ast = parser.parse('```typescript\nconst x = 1\n```\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'code-block', matches: 'typescript' },
          value: 'const y = 2',
        },
      ])
      const codeBlock = result.ast.root.children![0]!
      expect(codeBlock.type).toBe('code-block')
      expect(codeBlock.label).toBe('typescript')
      expect(codeBlock.value).toBe('const y = 2')
    })

    it('modified section preserves untouched sibling section', () => {
      const ast = parser.parse('## A\n\nBody A.\n\n## B\n\nBody B.\n')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'section', matches: '^A$' },
          content: 'Updated A.\n',
        },
      ])
      const sectionA = result.ast.root.children![0]!
      const sectionB = result.ast.root.children![1]!
      expect(sectionA.children![0]!).toMatchObject({ type: 'paragraph', value: 'Updated A.' })
      expect(sectionB.children![0]!).toMatchObject({ type: 'paragraph', value: 'Body B.' })
    })
  })

  describe('apply — removed operation for all node types', () => {
    it('removed section detaches heading and body', () => {
      const ast = parser.parse('## Keep\n\nKeep body.\n\n## Remove\n\nRemove body.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'section', matches: 'Remove' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!.label).toBe('Keep')
    })

    it('removed paragraph leaves sibling paragraphs intact', () => {
      const ast = parser.parse('## S\n\nFirst.\n\nSecond.\n\nThird.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'paragraph', contains: 'Second' },
        },
      ])
      const section = result.ast.root.children![0]!
      expect(section.children).toHaveLength(2)
      expect(section.children![0]!).toMatchObject({ type: 'paragraph', value: 'First.' })
      expect(section.children![1]!).toMatchObject({ type: 'paragraph', value: 'Third.' })
    })

    it('removed list detaches entire list node', () => {
      const ast = parser.parse('Paragraph.\n\n- Item 1\n- Item 2\n\nOther paragraph.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'list' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]!.type).toBe('paragraph')
      expect(result.ast.root.children![1]!.type).toBe('paragraph')
    })

    it('removed list-item detaches only targeted item', () => {
      const ast = parser.parse('- Alpha\n- Beta\n- Gamma\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'list-item', matches: 'Beta' },
        },
      ])
      const list = result.ast.root.children![0]!
      expect(list.children).toHaveLength(2)
      expect(list.children![0]!).toMatchObject({ type: 'list-item', label: 'Alpha' })
      expect(list.children![1]!).toMatchObject({ type: 'list-item', label: 'Gamma' })
    })

    it('removed code-block detaches code node', () => {
      const ast = parser.parse('Paragraph.\n\n```js\ncode\n```\n\nOther.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'code-block', matches: 'js' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]!.type).toBe('paragraph')
      expect(result.ast.root.children![1]!.type).toBe('paragraph')
    })

    it('removed thematic-break detaches rule node', () => {
      const ast = parser.parse('Before.\n\n---\n\nAfter.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'thematic-break' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]!).toMatchObject({ type: 'paragraph', value: 'Before.' })
      expect(result.ast.root.children![1]!).toMatchObject({ type: 'paragraph', value: 'After.' })
    })
  })

  describe('apply — mixed-operation batch atomicity', () => {
    it('ambiguous selector in mixed added/modified batch fails atomically', () => {
      const ast = parser.parse('## Section A\n\nShared text.\n\n## Section B\n\nShared text.\n')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'removed',
            selector: { type: 'section', matches: 'Section A' },
          },
          {
            op: 'modified',
            selector: { type: 'paragraph', contains: 'Shared text' },
            content: 'Should not apply.\n',
          },
        ]),
      ).toThrow(DeltaApplicationError)

      const sectionA = ast.root.children![0]!
      expect(sectionA.label).toBe('Section A')
    })

    it('mixed added/removed batch succeeds when selectors are unique', () => {
      const ast = parser.parse('## A\n\nRemove me.\n\n## B\n\nKeep me.\n')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'section', matches: '^A$' },
        },
        {
          op: 'added',
          position: { parent: { type: 'section', matches: 'B' } },
          content: 'New paragraph.\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!.label).toBe('B')
      expect(result.ast.root.children![0]!.children).toHaveLength(2)
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

function flattenOutlineEntries<T extends { children?: readonly T[] }>(entries: readonly T[]): T[] {
  const all: T[] = []
  for (const entry of entries) {
    all.push(entry)
    if (entry.children) {
      all.push(...flattenOutlineEntries(entry.children))
    }
  }
  return all
}
