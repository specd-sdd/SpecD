import { describe, expect, it } from 'vitest'
import { YamlParser } from '../../../src/infrastructure/artifact-parser/yaml-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

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

  describe('renderSubtree', () => {
    it('returns same content as serialize for unchanged root node', () => {
      const content = 'schema: spec-driven\n# important comment\nmodel: claude-opus-4-6\n'
      const ast = parser.parse(content)
      expect(parser.renderSubtree(ast.root)).toBe(parser.serialize(ast))
    })

    it('reconstructs YAML when _yaml is absent', () => {
      const ast = parser.parse('key: value')
      const rootWithout: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(ast.root)) {
        if (k !== '_yaml') rootWithout[k] = v
      }
      const rendered = parser.renderSubtree(rootWithout as typeof ast.root)
      expect(rendered).toContain('key')
      expect(rendered).toContain('value')
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
      const pair = result.ast.root.children![0]!
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
      const llmPair = result.ast.root.children![0]!
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
      expect(result.ast.root.children).toHaveLength(2)
    })

    it('removed: detaches a pair', () => {
      const ast = parser.parse('keep: me\nremove: me')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'pair', matches: 'remove' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!.label).toBe('keep')
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

  describe('apply — added operation for pair/sequence-item', () => {
    it('added pair to document root via content', () => {
      const ast = parser.parse('key: value')
      const result = parser.apply(ast, [
        {
          op: 'added',
          content: 'newKey: newValue\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      expect(result.ast.root.children![1]!).toMatchObject({
        type: 'pair',
        label: 'newKey',
        value: 'newValue',
      })
    })

    it('added pair to mapping via content', () => {
      const ast = parser.parse('config:\n  debug: false')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'mapping' } },
          content: 'verbose: true\n',
        },
      ])
      const configPair = result.ast.root.children![0]!
      const mapping = configPair.children![0]!
      expect(mapping.type).toBe('mapping')
      expect(mapping.children).toHaveLength(2)
      const verbosePair = mapping.children!.find((c) => c.label === 'verbose')
      expect(verbosePair?.value).toBe(true)
    })

    it('added sequence-item via value into existing sequence', () => {
      const ast = parser.parse('tags:\n  - alpha\n  - beta')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'sequence' } },
          value: 'gamma',
        },
      ])
      const tagsPair = result.ast.root.children![0]!
      const seq = tagsPair.children![0]!
      expect(seq.children).toHaveLength(3)
      expect(seq.children![2]).toMatchObject({ type: 'sequence-item', value: 'gamma' })
    })

    it('added sequence-item as scalar via value', () => {
      const ast = parser.parse('tags:\n  - alpha')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'sequence' } },
          value: 'beta',
        },
      ])
      const tagsPair = result.ast.root.children![0]!
      const seq = tagsPair.children![0]!
      expect(seq.children).toHaveLength(2)
      expect(seq.children![1]).toMatchObject({ type: 'sequence-item', value: 'beta' })
    })
  })

  describe('apply — modified operation across YAML node types', () => {
    it('modified document replaces root children', () => {
      const ast = parser.parse('old: true')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'document' },
          content: 'new: false',
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!).toMatchObject({
        type: 'pair',
        label: 'new',
        value: false,
      })
    })

    it('modified mapping replaces children via content', () => {
      const ast = parser.parse('config:\n  old: value')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'mapping' },
          content: 'new: replaced',
        },
      ])
      const configPair = result.ast.root.children![0]!
      const mapping = configPair.children![0]!
      expect(mapping.children).toHaveLength(1)
      expect(mapping.children![0]!).toMatchObject({ type: 'pair', label: 'new', value: 'replaced' })
    })

    it('modified pair replaces scalar value', () => {
      const ast = parser.parse('model: old-model\nschema: spec-driven')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'model' },
          value: 'new-model',
        },
      ])
      expect(result.ast.root.children![0]!).toMatchObject({
        type: 'pair',
        label: 'model',
        value: 'new-model',
      })
      expect(result.ast.root.children![1]!).toMatchObject({
        type: 'pair',
        label: 'schema',
        value: 'spec-driven',
      })
    })

    it('modified pair replaces with nested mapping via value', () => {
      const ast = parser.parse('config: simple')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'config' },
          value: { debug: true, port: 3000 },
        },
      ])
      const configPair = result.ast.root.children![0]!
      expect(configPair.label).toBe('config')
      expect(configPair.children).toHaveLength(1)
      expect(configPair.children![0]!.type).toBe('mapping')
    })

    it('modified sequence replaces items via value', () => {
      const ast = parser.parse('tags:\n  - alpha\n  - beta')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'sequence' },
          value: ['x', 'y'],
        },
      ])
      const seq = result.ast.root.children![0]!.children![0]!
      expect(seq.children).toHaveLength(2)
      expect(seq.children![0]).toMatchObject({ type: 'sequence-item', value: 'x' })
      expect(seq.children![1]).toMatchObject({ type: 'sequence-item', value: 'y' })
    })

    it('modified sequence-item via index', () => {
      const ast = parser.parse('items:\n  - first\n  - second\n  - third')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'sequence-item', index: 1 },
          value: 'replaced',
        },
      ])
      const seq = result.ast.root.children![0]!.children![0]!
      expect(seq.children![0]!.value).toBe('first')
      expect(seq.children![1]!.value).toBe('replaced')
      expect(seq.children![2]!.value).toBe('third')
    })

    it('modified sequence-item via where selector', () => {
      const ast = parser.parse(
        'steps:\n  - name: lint\n    run: old-lint\n  - name: test\n    run: pnpm test',
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'sequence-item', where: { name: 'lint' } },
          value: { name: 'lint', run: 'new-lint' },
        },
      ])
      const seq = result.ast.root.children![0]!.children![0]!
      const lintItem = seq.children![0]!
      const lintMapping = lintItem.children![0]!
      const runPair = lintMapping.children!.find((c) => c.label === 'run')
      expect(runPair?.value).toBe('new-lint')
      const testItem = seq.children![1]!
      const testMapping = testItem.children![0]!
      const testRun = testMapping.children!.find((c) => c.label === 'run')
      expect(testRun?.value).toBe('pnpm test')
    })

    it('modified pair with parent disambiguates nested keys', () => {
      const ast = parser.parse('outer:\n  name: old\ninner:\n  name: keep')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'name', parent: { type: 'pair', matches: 'outer' } },
          value: 'new',
        },
      ])
      const outerPair = result.ast.root.children!.find((c) => c.label === 'outer')!
      const outerName = outerPair.children![0]!.children![0]!
      expect(outerName.value).toBe('new')
      const innerPair = result.ast.root.children!.find((c) => c.label === 'inner')!
      const innerName = innerPair.children![0]!.children![0]!
      expect(innerName.value).toBe('keep')
    })
  })

  describe('apply — removed operation for pair and sequence-item', () => {
    it('removed pair from root document', () => {
      const ast = parser.parse('keep: me\nremove: me\nalso: here')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'pair', matches: 'remove' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      const labels = result.ast.root.children!.map((c) => c.label)
      expect(labels).toEqual(['keep', 'also'])
    })

    it('removed pair from nested mapping', () => {
      const ast = parser.parse('config:\n  debug: true\n  verbose: false')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: {
            type: 'pair',
            matches: 'verbose',
            parent: { type: 'pair', matches: 'config' },
          },
        },
      ])
      const configPair = result.ast.root.children![0]!
      const mapping = configPair.children![0]!
      expect(mapping.children).toHaveLength(1)
      expect(mapping.children![0]!.label).toBe('debug')
    })

    it('removed sequence-item by index', () => {
      const ast = parser.parse('tags:\n  - alpha\n  - beta\n  - gamma')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'sequence-item', index: 1 },
        },
      ])
      const seq = result.ast.root.children![0]!.children![0]!
      expect(seq.children).toHaveLength(2)
      expect(seq.children![0]).toMatchObject({ type: 'sequence-item', value: 'alpha' })
      expect(seq.children![1]).toMatchObject({ type: 'sequence-item', value: 'gamma' })
    })

    it('removed sequence-item by where selector', () => {
      const ast = parser.parse(
        'steps:\n  - name: lint\n    run: pnpm lint\n  - name: test\n    run: pnpm test',
      )
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'sequence-item', where: { name: 'lint' } },
        },
      ])
      const seq = result.ast.root.children![0]!.children![0]!
      expect(seq.children).toHaveLength(1)
      const remaining = seq.children![0]!
      const mapping = remaining.children![0]!
      const namePair = mapping.children!.find((c) => c.label === 'name')
      expect(namePair?.value).toBe('test')
    })

    it('removed entire sequence via pair', () => {
      const ast = parser.parse('name: core\ntags:\n  - alpha\n  - beta')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'pair', matches: 'tags' },
        },
      ])
      expect(result.ast.root.children).toHaveLength(1)
      expect(result.ast.root.children![0]!.label).toBe('name')
    })
  })

  describe('apply — selector constraint and ambiguity in mixed batches', () => {
    it('ambiguous selector in mixed added/removed batch fails atomically', () => {
      const ast = parser.parse('keep: value\nshared: one\nnested:\n  shared: two')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'removed',
            selector: { type: 'pair', matches: 'keep' },
          },
          {
            op: 'modified',
            selector: { type: 'pair', matches: 'shared' },
            value: 'changed',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('mixed added/modified/removed succeeds with unique selectors', () => {
      const ast = parser.parse('old: value\nkeep: unchanged')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'pair', matches: 'old' },
        },
        {
          op: 'modified',
          selector: { type: 'pair', matches: 'keep' },
          value: 'updated',
        },
        {
          op: 'added',
          content: 'new: pair\n',
        },
      ])
      expect(result.ast.root.children).toHaveLength(2)
      const keepPair = result.ast.root.children!.find((c) => c.label === 'keep')
      expect(keepPair?.value).toBe('updated')
      const newPair = result.ast.root.children!.find((c) => c.label === 'new')
      expect(newPair?.value).toBe('pair')
    })

    it('index and where together in mixed batch fails atomically', () => {
      const ast = parser.parse('steps:\n  - name: lint\n  - name: test')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'removed',
            selector: { type: 'sequence-item', index: 0 },
          },
          {
            op: 'modified',
            selector: { type: 'sequence-item', index: 1, where: { name: 'test' } },
            value: 'changed',
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

    it('parses no-op entry', () => {
      const entries = parser.parseDelta('- op: no-op\n')
      expect(entries).toHaveLength(1)
      expect(entries[0]!.op).toBe('no-op')
    })

    it('parses no-op entry with description', () => {
      const entries = parser.parseDelta('- op: no-op\n  description: "No changes needed"\n')
      expect(entries).toHaveLength(1)
      expect(entries[0]!.op).toBe('no-op')
      expect(entries[0]!.description).toBe('No changes needed')
    })

    it('rejects no-op mixed with other entries', () => {
      const content = `
- op: no-op
- op: modified
  selector:
    type: pair
    matches: model
  value: new
`
      expect(() => parser.parseDelta(content)).toThrow(SchemaValidationError)
    })

    it('rejects no-op with selector', () => {
      const content = `
- op: no-op
  selector:
    type: pair
    matches: foo
`
      expect(() => parser.parseDelta(content)).toThrow(SchemaValidationError)
    })

    it('rejects no-op with content', () => {
      expect(() => parser.parseDelta('- op: no-op\n  content: "some content"\n')).toThrow(
        SchemaValidationError,
      )
    })

    it('rejects no-op with value', () => {
      expect(() => parser.parseDelta('- op: no-op\n  value: 42\n')).toThrow(SchemaValidationError)
    })

    it('rejects no-op with position', () => {
      const content = `
- op: no-op
  position:
    parent:
      type: pair
      matches: root
`
      expect(() => parser.parseDelta(content)).toThrow(SchemaValidationError)
    })

    it('rejects no-op with rename', () => {
      expect(() => parser.parseDelta('- op: no-op\n  rename: "new"\n')).toThrow(
        SchemaValidationError,
      )
    })

    it('rejects no-op with strategy', () => {
      expect(() => parser.parseDelta('- op: no-op\n  strategy: append\n')).toThrow(
        SchemaValidationError,
      )
    })

    it('rejects no-op with mergeKey', () => {
      expect(() => parser.parseDelta('- op: no-op\n  mergeKey: name\n')).toThrow(
        SchemaValidationError,
      )
    })

    it('parses description on regular delta entry', () => {
      const content = `
- op: modified
  description: "Update model value"
  selector:
    type: pair
    matches: model
  value: new
`
      const entries = parser.parseDelta(content)
      expect(entries).toHaveLength(1)
      expect(entries[0]!.op).toBe('modified')
      expect(entries[0]!.description).toBe('Update model value')
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
    it('returns compact default entries for top-level pairs', () => {
      const ast = parser.parse('schema: spec-driven\nmodel: gpt-4')
      const outline = parser.outline(ast)
      expect(outline.length).toBeGreaterThanOrEqual(2)
      const labels = outline.map((e) => e.label)
      expect(labels).toContain('schema')
      expect(labels).toContain('model')
      expect(outline.some((e) => e.type === 'mapping')).toBe(false)
    })

    it('includes mapping/sequence families in full mode', () => {
      const ast = parser.parse('schema: spec-driven\nsteps:\n  - one\n')
      const outline = parser.outline(ast, { full: true })
      type TestOutlineEntry = { type: string; children?: readonly TestOutlineEntry[] }
      const flatten = (entries: readonly TestOutlineEntry[]): string[] =>
        entries.flatMap((e) => [e.type, ...(e.children ? flatten(e.children) : [])])
      const types = flatten(outline as readonly TestOutlineEntry[])
      expect(types).toContain('sequence')
      expect(types).toContain('sequence-item')
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
