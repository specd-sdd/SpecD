import { describe, expect, it } from 'vitest'
import { PlaintextParser } from '../../../src/infrastructure/artifact-parser/plaintext-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'

describe('PlaintextParser', () => {
  const parser = new PlaintextParser()

  describe('fileExtensions', () => {
    it('includes .txt and .text', () => {
      expect(parser.fileExtensions).toContain('.txt')
      expect(parser.fileExtensions).toContain('.text')
    })
  })

  describe('parse', () => {
    it('parses empty content to document with empty children', () => {
      const ast = parser.parse('')
      expect(ast.root.type).toBe('document')
      expect(ast.root.children).toEqual([])
    })

    it('parses whitespace-only content to document with empty children', () => {
      const ast = parser.parse('   \n  ')
      expect(ast.root.type).toBe('document')
      expect(ast.root.children).toEqual([])
    })

    it('parses single paragraph with line children', () => {
      const ast = parser.parse('Hello world')
      expect(ast.root.children).toHaveLength(1)
      expect(ast.root.children![0]!.type).toBe('paragraph')
      expect(ast.root.children![0]!.children).toEqual([{ type: 'line', value: 'Hello world' }])
    })

    it('parses multiple paragraphs separated by double newlines', () => {
      const ast = parser.parse('First paragraph.\n\nSecond paragraph.')
      expect(ast.root.children).toHaveLength(2)
      expect(ast.root.children![0]!.type).toBe('paragraph')
      expect(ast.root.children![1]!.type).toBe('paragraph')
    })

    it('creates line children for multi-line paragraphs', () => {
      const ast = parser.parse('Line one\nLine two')
      const para = ast.root.children![0]!
      expect(para.type).toBe('paragraph')
      expect(para.children).toHaveLength(2)
      expect(para.children![0]).toMatchObject({ type: 'line', value: 'Line one' })
      expect(para.children![1]).toMatchObject({ type: 'line', value: 'Line two' })
    })
  })

  describe('serialize', () => {
    it('serializes paragraphs joined by double newlines', () => {
      const ast = parser.parse('First.\n\nSecond.')
      const result = parser.serialize(ast)
      expect(result).toBe('First.\n\nSecond.')
    })

    it('round-trip: serialize(parse(content)) returns equivalent content', () => {
      const content = 'Alpha.\n\nBeta.\n\nGamma.'
      const ast = parser.parse(content)
      const serialized = parser.serialize(ast)
      expect(serialized).toBe(content)
    })

    it('serializes empty document to empty string', () => {
      const ast = parser.parse('')
      expect(parser.serialize(ast)).toBe('')
    })
  })

  describe('apply', () => {
    it('added: appends paragraph when no position', () => {
      const ast = parser.parse('First.')
      const result = parser.apply(ast, [
        {
          op: 'added',
          content: 'Second.',
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(parser.serialize(result.ast)).toBe('First.\n\nSecond.')
    })

    it('removed: detaches a matched paragraph', () => {
      const ast = parser.parse('Keep me.\n\nRemove me.\n\nAlso keep.')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'paragraph', contains: 'Remove me' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![0]).toMatchObject({
        type: 'paragraph',
        children: [{ type: 'line', value: 'Keep me.' }],
      })
      expect(result.ast.root.children![1]).toMatchObject({
        type: 'paragraph',
        children: [{ type: 'line', value: 'Also keep.' }],
      })
    })

    it('throws DeltaApplicationError when selector resolves to no node', () => {
      const ast = parser.parse('Only paragraph.')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'removed',
            selector: { type: 'paragraph', contains: 'nonexistent' },
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('rejects content and value together', () => {
      const ast = parser.parse('Hello.')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'added',
            content: 'New text',
            value: 'something',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })
  })

  describe('nodeTypes', () => {
    it('returns descriptors for document, paragraph, and line', () => {
      const types = parser.nodeTypes()
      const typeNames = types.map((t) => t.type)
      expect(typeNames).toContain('document')
      expect(typeNames).toContain('paragraph')
      expect(typeNames).toContain('line')
    })
  })

  describe('outline', () => {
    it('returns one entry per paragraph with first 50 chars as label', () => {
      const ast = parser.parse(
        'Short paragraph.\n\nA much longer paragraph that exceeds fifty characters total in length.',
      )
      const outline = parser.outline(ast)
      expect(outline).toHaveLength(2)
      expect(outline[0]!.type).toBe('paragraph')
      expect(outline[0]!.label).toBe('Short paragraph.')
      expect(outline[1]!.label).toHaveLength(50)
      expect(outline[1]!.depth).toBe(0)
    })

    it('returns empty array for empty document', () => {
      const ast = parser.parse('')
      expect(parser.outline(ast)).toEqual([])
    })
  })

  describe('deltaInstructions', () => {
    it('returns a non-empty string', () => {
      const instructions = parser.deltaInstructions()
      expect(typeof instructions).toBe('string')
      expect(instructions.length).toBeGreaterThan(0)
    })
  })

  describe('parseDelta', () => {
    it('returns empty array', () => {
      expect(parser.parseDelta('')).toEqual([])
    })
  })
})
