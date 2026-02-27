import { describe, expect, it } from 'vitest'
import { YamlParser } from '../../../src/infrastructure/artifact-parser/yaml-parser.js'
import { DeltaApplicationError } from '../../../src/application/ports/artifact-parser.js'

describe('YamlParser', () => {
  const parser = new YamlParser()

  describe('fileExtensions', () => {
    it('includes .yaml and .yml', () => {
      expect(parser.fileExtensions).toContain('.yaml')
      expect(parser.fileExtensions).toContain('.yml')
    })
  })

  describe('parse', () => {
    it('parses scalar pair', () => {
      const ast = parser.parse('schema: spec-driven')
      expect(ast.root.type).toBe('document')
      const pair = ast.root.children![0]!
      expect(pair).toMatchObject({ type: 'pair', label: 'schema', value: 'spec-driven' })
    })

    it('parses nested mapping under pair', () => {
      const ast = parser.parse('llm:\n  model: claude-opus-4-6')
      const llmPair = ast.root.children![0]!
      expect(llmPair.label).toBe('llm')
      expect(llmPair.children).toHaveLength(1)
      const mapping = llmPair.children![0]!
      expect(mapping.type).toBe('mapping')
      const modelPair = mapping.children![0]!
      expect(modelPair).toMatchObject({ type: 'pair', label: 'model', value: 'claude-opus-4-6' })
    })

    it('parses sequence of scalars', () => {
      const ast = parser.parse('tags:\n  - alpha\n  - beta')
      const tagsPair = ast.root.children![0]!
      expect(tagsPair.label).toBe('tags')
      const seq = tagsPair.children![0]!
      expect(seq.type).toBe('sequence')
      expect(seq.children).toHaveLength(2)
      expect(seq.children![0]).toMatchObject({ type: 'sequence-item', value: 'alpha' })
      expect(seq.children![1]).toMatchObject({ type: 'sequence-item', value: 'beta' })
    })

    it('parses sequence of objects', () => {
      const ast = parser.parse(
        'steps:\n  - name: lint\n    run: pnpm lint\n  - name: test\n    run: pnpm test',
      )
      const stepsPair = ast.root.children![0]!
      const seq = stepsPair.children![0]!
      expect(seq.type).toBe('sequence')
      expect(seq.children).toHaveLength(2)
      const firstItem = seq.children![0]!
      expect(firstItem.type).toBe('sequence-item')
      const firstMapping = firstItem.children![0]!
      expect(firstMapping.type).toBe('mapping')
      const namePair = firstMapping.children!.find((c) => c.label === 'name')
      expect(namePair?.value).toBe('lint')
    })

    it('parses numeric scalar pair', () => {
      const ast = parser.parse('maxTokens: 4096')
      const pair = ast.root.children![0]!
      expect(pair).toMatchObject({ type: 'pair', label: 'maxTokens', value: 4096 })
    })

    it('parses boolean scalar pair', () => {
      const ast = parser.parse('enabled: true')
      const pair = ast.root.children![0]!
      expect(pair).toMatchObject({ type: 'pair', label: 'enabled', value: true })
    })

    it('stores original content in _yaml field for round-trip', () => {
      const content = 'schema: spec-driven\n# comment\nmodel: gpt-4\n'
      const ast = parser.parse(content)
      expect((ast.root as Record<string, unknown>)['_yaml']).toBe(content)
    })
  })

  describe('serialize', () => {
    it('round-trip preserves comments via _yaml field', () => {
      const content = 'schema: spec-driven\n# important comment\nmodel: claude-opus-4-6\n'
      const ast = parser.parse(content)
      expect(parser.serialize(ast)).toBe(content)
    })

    it('reconstructs YAML from AST when _yaml is not present', () => {
      const ast = parser.parse('key: value')
      // Remove _yaml to force reconstruction
      const rootWithout: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(ast.root)) {
        if (k !== '_yaml') rootWithout[k] = v
      }
      const astWithout = { root: rootWithout as typeof ast.root }
      const serialized = parser.serialize(astWithout)
      expect(serialized).toContain('key')
      expect(serialized).toContain('value')
    })
  })

  describe('apply', () => {
    it('modified: changes a scalar pair value', () => {
      const ast = parser.parse('model: claude-sonnet-4-6')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'model' },
          value: 'claude-opus-4-6',
        },
      ])
      const pair = result.root.children![0]!
      expect(pair.value).toBe('claude-opus-4-6')
    })

    it('modified: changes nested pair value', () => {
      const ast = parser.parse('llm:\n  model: old-model')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'model', parent: { type: 'pair', matches: 'llm' } },
          value: 'new-model',
        },
      ])
      const llmPair = result.root.children![0]!
      const modelPair = llmPair.children![0]!.children![0]!
      expect(modelPair.value).toBe('new-model')
    })

    it('added: appends a new pair to document', () => {
      const ast = parser.parse('key: value')
      const result = parser.apply(ast, [
        {
          op: 'added',
          value: { newKey: 'newValue' },
        },
      ])
      expect(result.root.children).toHaveLength(2)
    })

    it('removed: detaches a pair', () => {
      const ast = parser.parse('keep: me\nremove: me')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'pair', matches: 'remove' },
        },
      ])
      expect(result.root.children).toHaveLength(1)
      expect(result.root.children![0]!.label).toBe('keep')
    })

    it('throws DeltaApplicationError when selector resolves to no node', () => {
      const ast = parser.parse('key: value')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'pair', matches: 'nonexistent' },
            value: 'x',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('rejects selector.index and selector.where together', () => {
      const ast = parser.parse('steps:\n  - name: a')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'sequence-item', index: 0, where: { name: 'a' } },
            value: { name: 'b' },
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })
  })

  describe('parseDelta', () => {
    it('parses valid YAML delta array', () => {
      const content = `
- op: modified
  selector:
    type: pair
    matches: model
  value: claude-opus-4-6
- op: removed
  selector:
    type: pair
    matches: deprecated
`
      const entries = parser.parseDelta(content)
      expect(entries).toHaveLength(2)
      expect(entries[0]!.op).toBe('modified')
      expect(entries[1]!.op).toBe('removed')
    })

    it('returns empty array for non-array YAML', () => {
      expect(parser.parseDelta('key: value')).toEqual([])
    })
  })

  describe('nodeTypes', () => {
    it('returns descriptors for document, mapping, pair, sequence, sequence-item', () => {
      const types = parser.nodeTypes()
      const typeNames = types.map((t) => t.type)
      expect(typeNames).toContain('document')
      expect(typeNames).toContain('mapping')
      expect(typeNames).toContain('pair')
      expect(typeNames).toContain('sequence')
      expect(typeNames).toContain('sequence-item')
    })
  })

  describe('outline', () => {
    it('returns entries for top-level pairs', () => {
      const ast = parser.parse('schema: spec-driven\nmodel: gpt-4')
      const outline = parser.outline(ast)
      expect(outline.length).toBeGreaterThanOrEqual(2)
      const labels = outline.map((e) => e.label)
      expect(labels).toContain('schema')
      expect(labels).toContain('model')
    })
  })

  describe('deltaInstructions', () => {
    it('returns non-empty string describing YAML delta format', () => {
      const instructions = parser.deltaInstructions()
      expect(typeof instructions).toBe('string')
      expect(instructions).toContain('pair')
    })
  })
})
