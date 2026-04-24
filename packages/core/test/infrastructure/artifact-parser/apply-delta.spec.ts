import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  resolveNodes,
} from '../../../src/infrastructure/artifact-parser/_shared/apply-delta.js'
import type {
  ArtifactAST,
  ArtifactNode,
  DeltaEntry,
} from '../../../src/application/ports/artifact-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Identity parseContent: wraps content in a document node with a single child. */
function parseContent(content: string): ArtifactAST {
  return {
    root: {
      type: 'document',
      children: [{ type: 'pair', label: content, value: content }],
    },
  }
}

/** Identity valueToNode: converts a value to a node with value set. */
function valueToNode(value: unknown, ctx: { nodeType: string; parentType: string }): ArtifactNode {
  if (Array.isArray(value)) {
    return {
      type: ctx.nodeType === 'unknown' ? 'sequence' : ctx.nodeType,
      children: (value as unknown[]).map((v, i) => ({
        type: 'sequence-item',
        children: [
          {
            type: 'mapping',
            children: Object.entries(v as Record<string, unknown>).map(([k, val]) => ({
              type: 'pair',
              label: k,
              value: val as string,
            })),
          },
        ],
      })),
    }
  }
  return {
    type: ctx.nodeType === 'unknown' ? 'pair' : ctx.nodeType,
    value: value as string,
  }
}

/** Builds a simple AST with a document root and given children. */
function makeAST(children: ArtifactNode[]): ArtifactAST {
  return { root: { type: 'document', children } }
}

/** Creates a pair node. */
function pair(label: string, value: string): ArtifactNode {
  return { type: 'pair', label, value }
}

/** Creates a pair node with children (nested mapping). */
function pairWithChildren(label: string, children: ArtifactNode[]): ArtifactNode {
  return { type: 'pair', label, children }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyDelta', () => {
  describe('no-op defensive guard', () => {
    it('returns deep clone of input AST when all entries are no-op', () => {
      const ast = makeAST([pair('name', 'specd'), pair('version', '1.0.0')])
      const delta: DeltaEntry[] = [{ op: 'no-op' }]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]!.label).toBe('name')
      expect(result.ast.root.children![1]!.label).toBe('version')
      // Must be a separate object (deep clone)
      expect(result.ast.root).not.toBe(ast.root)
    })

    it('returns deep clone for empty delta array', () => {
      const ast = makeAST([pair('name', 'specd')])
      const delta: DeltaEntry[] = []

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root).not.toBe(ast.root)
    })
  })

  describe('added operation', () => {
    it('appends a new node at document root level', () => {
      const ast = makeAST([pair('name', 'specd')])
      const delta: DeltaEntry[] = [{ op: 'added', content: 'version' }]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![1]!.label).toBe('version')
    })

    it('inserts at first position when position.first is true', () => {
      const ast = makeAST([pair('second', 'b')])
      const delta: DeltaEntry[] = [
        {
          op: 'added',
          content: 'first',
          position: { first: true },
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children![0]!.label).toBe('first')
      expect(result.ast.root.children![1]!.label).toBe('second')
    })

    it('inserts after a sibling matching position.after', () => {
      const ast = makeAST([pair('a', '1'), pair('c', '3')])
      const delta: DeltaEntry[] = [
        {
          op: 'added',
          content: 'b',
          position: {
            after: { type: 'pair', matches: '^a$' },
          },
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children).toHaveLength(3)
      expect(result.ast.root.children![0]!.label).toBe('a')
      expect(result.ast.root.children![1]!.label).toBe('b')
      expect(result.ast.root.children![2]!.label).toBe('c')
    })

    it('inserts under a parent scope when position.parent is set', () => {
      const mapping: ArtifactNode = { type: 'mapping', children: [pair('x', '1')] }
      const ast = makeAST([pairWithChildren('config', [mapping])])
      const delta: DeltaEntry[] = [
        {
          op: 'added',
          content: 'y',
          position: { parent: { type: 'mapping' } },
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      const configPair = result.ast.root.children![0]!
      const innerMapping = configPair.children![0]!
      expect(innerMapping.children).toHaveLength(2)
    })

    it('throws when added entry has a selector', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        { op: 'added', selector: { type: 'pair' }, content: 'bad' } as DeltaEntry,
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when added entry has neither content nor value', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [{ op: 'added' }]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })
  })

  describe('description field', () => {
    it('is ignored during application on a modified entry', () => {
      const ast = makeAST([pair('name', 'old')])
      const withDesc: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^name$' },
          value: 'new',
          description: 'Update name',
        },
      ]
      const withoutDesc: DeltaEntry[] = [
        { op: 'modified', selector: { type: 'pair', matches: '^name$' }, value: 'new' },
      ]

      const resultWith = applyDelta(ast, withDesc, parseContent, valueToNode)
      const resultWithout = applyDelta(ast, withoutDesc, parseContent, valueToNode)

      expect(resultWith.ast.root.children![0]!.value).toBe('new')
      expect(resultWithout.ast.root.children![0]!.value).toBe('new')
    })
  })

  describe('modified operation', () => {
    it('renames a matched node', () => {
      const ast = makeAST([pair('old-name', 'value')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^old-name$' },
          rename: 'new-name',
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children![0]!.label).toBe('new-name')
      expect(result.ast.root.children![0]!.value).toBe('value')
    })

    it('replaces node value', () => {
      const ast = makeAST([pair('name', 'old-value')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^name$' },
          value: 'new-value',
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children![0]!.value).toBe('new-value')
    })

    it('replaces node content (children)', () => {
      const ast = makeAST([pairWithChildren('block', [pair('old', 'child')])])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^block$' },
          content: 'new-child',
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      const block = result.ast.root.children![0]!
      expect(block.label).toBe('block')
      // parseContent returns a document with one child labeled 'new-child'
      expect(block.children![0]!.label).toBe('new-child')
    })

    it('preserves adapter metadata for untouched nodes', () => {
      const untouchedParagraph: ArtifactNode = {
        type: 'paragraph',
        value: 'Use `code`',
        _inlines: [{ type: 'inlineCode', value: 'code' }],
      }
      const ast = makeAST([untouchedParagraph, pair('name', 'old-value')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^name$' },
          value: 'new-value',
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)
      expect(result.ast.root.children![0]!._inlines).toEqual([
        { type: 'inlineCode', value: 'code' },
      ])
    })
  })

  describe('removed operation', () => {
    it('removes a matched node', () => {
      const ast = makeAST([pair('keep', '1'), pair('remove-me', '2'), pair('also-keep', '3')])
      const delta: DeltaEntry[] = [
        {
          op: 'removed',
          selector: { type: 'pair', matches: '^remove-me$' },
        },
      ]

      const result = applyDelta(ast, delta, parseContent, valueToNode)

      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]!.label).toBe('keep')
      expect(result.ast.root.children![1]!.label).toBe('also-keep')
    })
  })

  describe('error handling', () => {
    it('throws DeltaApplicationError when selector resolves to no node', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^nonexistent$' },
          value: 'x',
        },
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws DeltaApplicationError when selector is ambiguous', () => {
      const ast = makeAST([pair('dup', '1'), pair('dup', '2')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^dup$' },
          value: 'x',
        },
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when entry has both content and value', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^a$' },
          content: 'x',
          value: 'y',
        },
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when rename is used on added entry', () => {
      const ast = makeAST([])
      const delta: DeltaEntry[] = [{ op: 'added', content: 'x', rename: 'bad' } as DeltaEntry]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when rename is used on removed entry', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'removed',
          selector: { type: 'pair', matches: '^a$' },
          rename: 'bad',
        } as DeltaEntry,
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when two entries resolve to the same node', () => {
      const ast = makeAST([pair('target', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^target$' },
          value: 'a',
        },
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^target$' },
          value: 'b',
        },
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when strategy merge-by is used without mergeKey', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^a$' },
          value: 'x',
          strategy: 'merge-by',
        },
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })

    it('throws when mergeKey is used without strategy merge-by', () => {
      const ast = makeAST([pair('a', '1')])
      const delta: DeltaEntry[] = [
        {
          op: 'modified',
          selector: { type: 'pair', matches: '^a$' },
          value: 'x',
          mergeKey: 'name',
        } as DeltaEntry,
      ]

      expect(() => applyDelta(ast, delta, parseContent, valueToNode)).toThrow(DeltaApplicationError)
    })
  })
})

describe('resolveNodes', () => {
  it('resolves nodes matching type selector', () => {
    const root: ArtifactNode = {
      type: 'document',
      children: [
        { type: 'pair', label: 'a', value: '1' },
        { type: 'pair', label: 'b', value: '2' },
        { type: 'section', label: 'heading' },
      ],
    }

    const results = resolveNodes(root, { type: 'pair' })
    expect(results).toHaveLength(2)
  })

  it('resolves nodes matching type and matches selector', () => {
    const root: ArtifactNode = {
      type: 'document',
      children: [
        { type: 'pair', label: 'name', value: 'specd' },
        { type: 'pair', label: 'version', value: '1.0' },
      ],
    }

    const results = resolveNodes(root, { type: 'pair', matches: '^name$' })
    expect(results).toHaveLength(1)
    expect(results[0]!.node.label).toBe('name')
  })

  it('returns empty array when no nodes match', () => {
    const root: ArtifactNode = {
      type: 'document',
      children: [{ type: 'pair', label: 'a', value: '1' }],
    }

    const results = resolveNodes(root, { type: 'section' })
    expect(results).toHaveLength(0)
  })
})
