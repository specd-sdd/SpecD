import { describe, expect, it } from 'vitest'
import { JsonParser } from '../../../src/infrastructure/artifact-parser/json-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'

describe('JsonParser', () => {
  const parser = new JsonParser()

  describe('fileExtensions', () => {
    it('includes .json', () => {
      expect(parser.fileExtensions).toContain('.json')
    })
  })

  describe('parse', () => {
    it('parses object property with scalar value', () => {
      const ast = parser.parse('{"version": "1.0.0"}')
      expect(ast.root.type).toBe('document')
      const obj = ast.root.children![0]!
      expect(obj.type).toBe('object')
      const prop = obj.children![0]!
      expect(prop).toMatchObject({ type: 'property', label: 'version', value: '1.0.0' })
    })

    it('parses nested object', () => {
      const ast = parser.parse('{"outer": {"inner": "value"}}')
      const obj = ast.root.children![0]!
      const outerProp = obj.children![0]!
      expect(outerProp.label).toBe('outer')
      expect(outerProp.children).toHaveLength(1)
      const innerObj = outerProp.children![0]!
      expect(innerObj.type).toBe('object')
      const innerProp = innerObj.children![0]!
      expect(innerProp).toMatchObject({ type: 'property', label: 'inner', value: 'value' })
    })

    it('parses array of scalars', () => {
      const ast = parser.parse('{"keywords": ["specd", "spec-driven"]}')
      const obj = ast.root.children![0]!
      const kw = obj.children![0]!
      expect(kw.label).toBe('keywords')
      const arr = kw.children![0]!
      expect(arr.type).toBe('array')
      expect(arr.children).toHaveLength(2)
      expect(arr.children![0]).toMatchObject({ type: 'array-item', value: 'specd' })
      expect(arr.children![1]).toMatchObject({ type: 'array-item', value: 'spec-driven' })
    })

    it('parses null values', () => {
      const ast = parser.parse('{"key": null}')
      const prop = ast.root.children![0]!.children![0]!
      expect(prop).toMatchObject({ type: 'property', label: 'key', value: null })
    })

    it('parses boolean values', () => {
      const ast = parser.parse('{"enabled": true}')
      const prop = ast.root.children![0]!.children![0]!
      expect(prop).toMatchObject({ type: 'property', label: 'enabled', value: true })
    })

    it('parses numeric values', () => {
      const ast = parser.parse('{"count": 42}')
      const prop = ast.root.children![0]!.children![0]!
      expect(prop).toMatchObject({ type: 'property', label: 'count', value: 42 })
    })
  })

  describe('serialize', () => {
    it('round-trip: parse then serialize produces equivalent JSON', () => {
      const json = '{\n  "name": "@specd/core",\n  "version": "0.1.0"\n}'
      const ast = parser.parse(json)
      const result = parser.serialize(ast)
      expect(JSON.parse(result)).toEqual(JSON.parse(json))
    })

    it('produces two-space indentation', () => {
      const ast = parser.parse('{"key": "value"}')
      const result = parser.serialize(ast)
      expect(result).toBe('{\n  "key": "value"\n}')
    })
  })

  describe('apply', () => {
    it('modified: changes a property value', () => {
      const ast = parser.parse('{"version": "1.0.0"}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'version' },
          value: '2.0.0',
        },
      ])
      const prop = result.ast.root.children![0]!.children![0]!
      expect(prop.value).toBe('2.0.0')
    })

    it('modified: strategy append adds items to array', () => {
      const ast = parser.parse('{"keywords": ["specd", "spec-driven"]}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'keywords' },
          strategy: 'append',
          value: ['artifacts'],
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(3)
      expect(arr.children![2]).toMatchObject({ type: 'array-item', value: 'artifacts' })
    })

    it('modified: strategy merge-by merges by key', () => {
      const ast = parser.parse(
        JSON.stringify({
          items: [
            { name: 'a', val: 'old' },
            { name: 'b', val: 'old' },
          ],
        }),
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'items' },
          strategy: 'merge-by',
          mergeKey: 'name',
          value: [{ name: 'a', val: 'new' }],
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      // First item (a) should be updated
      const firstItem = arr.children![0]!
      const firstMapping = firstItem.children![0]!
      const valProp = firstMapping.children!.find((c) => c.label === 'val')
      expect(valProp?.value).toBe('new')
      // Second item (b) should be preserved
      const secondItem = arr.children![1]!
      const secondMapping = secondItem.children![0]!
      const bValProp = secondMapping.children!.find((c) => c.label === 'val')
      expect(bValProp?.value).toBe('old')
    })

    it('added: appends a new array-item to an array', () => {
      const ast = parser.parse('{"tags": ["a", "b"]}')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'array' } },
          value: 'c',
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(3)
      expect(arr.children![2]).toMatchObject({ type: 'array-item', value: 'c' })
    })

    it('removed: detaches a property', () => {
      const ast = parser.parse('{"name": "core", "private": true}')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'property', matches: 'private' },
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(1)
      expect(obj.children![0]!.label).toBe('name')
    })

    it('throws DeltaApplicationError when selector resolves to no node', () => {
      const ast = parser.parse('{"name": "core"}')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'property', matches: 'nonexistent' },
            value: 'x',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('throws DeltaApplicationError when selector is ambiguous', () => {
      // Two properties with the same key name (not normally valid JSON, but we can test via AST)
      // Instead test ambiguity via a selector that matches multiple nodes in different branches
      const ast = parser.parse('{"name": "core", "nested": {"name": "inner"}}')
      // selector type: property matches: 'name' would match both the root name and the nested one
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'property', matches: '^name$' },
            value: 'changed',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('rejects content and value both set', () => {
      const ast = parser.parse('{"a": 1}')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'property', matches: 'a' },
            content: 'x',
            value: 'y',
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })

    it('rejects merge-by without mergeKey', () => {
      const ast = parser.parse('{"items": []}')
      expect(() =>
        parser.apply(ast, [
          {
            op: 'modified',
            selector: { type: 'property', matches: 'items' },
            strategy: 'merge-by',
            value: [],
          },
        ]),
      ).toThrow(DeltaApplicationError)
    })
  })

  describe('apply — added operation for object/property/array', () => {
    it('added property to root object via content', () => {
      const ast = parser.parse('{"name": "core"}')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'object' } },
          content: '{"version": "1.0.0"}',
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(2)
      expect(obj.children![1]!).toMatchObject({
        type: 'property',
        label: 'version',
        value: '1.0.0',
      })
    })

    it('added property with position.parent targeting object', () => {
      const ast = parser.parse('{"config": {"debug": false}}')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'object' } },
          value: { verbose: true },
        },
      ])
      const rootObj = result.ast.root.children![0]!
      expect(rootObj.children).toHaveLength(2)
    })

    it('added array-item via value into existing array', () => {
      const ast = parser.parse('{"tags": ["alpha"]}')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'array' } },
          value: 'beta',
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      expect(arr.children![1]).toMatchObject({ type: 'array-item', value: 'beta' })
    })

    it('added array-item as scalar via value into array', () => {
      const ast = parser.parse('{"tags": ["alpha"]}')
      const result = parser.apply(ast, [
        {
          op: 'added',
          position: { parent: { type: 'array' } },
          value: 'beta',
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      expect(arr.children![1]).toMatchObject({ type: 'array-item', value: 'beta' })
    })
  })

  describe('apply — modified operation across JSON node types', () => {
    it('modified document replaces root children', () => {
      const ast = parser.parse('{"old": true}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'document' },
          content: '{"new": true}',
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(1)
      expect(obj.children![0]!.label).toBe('new')
    })

    it('modified object replaces children via content', () => {
      const ast = parser.parse('{"a": 1, "b": 2}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'object' },
          content: '{"x": 99}',
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(1)
      expect(obj.children![0]!).toMatchObject({ type: 'property', label: 'x', value: 99 })
    })

    it('modified property replaces scalar value', () => {
      const ast = parser.parse('{"version": "1.0.0", "name": "core"}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'version' },
          value: '2.0.0',
        },
      ])
      const obj = result.ast.root.children![0]!
      const versionProp = obj.children!.find((c) => c.label === 'version')
      expect(versionProp?.value).toBe('2.0.0')
      const nameProp = obj.children!.find((c) => c.label === 'name')
      expect(nameProp?.value).toBe('core')
    })

    it('modified property replaces with nested object via value', () => {
      const ast = parser.parse('{"config": "old"}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'config' },
          value: { debug: true, port: 3000 },
        },
      ])
      const configProp = result.ast.root.children![0]!.children![0]!
      expect(configProp.label).toBe('config')
      expect(configProp.children).toHaveLength(1)
      expect(configProp.children![0]!.type).toBe('object')
    })

    it('modified array replaces items via value', () => {
      const ast = parser.parse('{"tags": ["a", "b"]}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'array' },
          value: ['x', 'y', 'z'],
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.type).toBe('array')
      expect(arr.children).toHaveLength(3)
      expect(arr.children![0]).toMatchObject({ type: 'array-item', value: 'x' })
      expect(arr.children![2]).toMatchObject({ type: 'array-item', value: 'z' })
    })

    it('modified array-item via index selector', () => {
      const ast = parser.parse('{"items": [10, 20, 30]}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'array-item', index: 1 },
          value: 99,
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children![0]!.value).toBe(10)
      expect(arr.children![1]!.value).toBe(99)
      expect(arr.children![2]!.value).toBe(30)
    })

    it('modified array-item via where selector', () => {
      const ast = parser.parse(
        JSON.stringify({
          users: [
            { name: 'alice', role: 'user' },
            { name: 'bob', role: 'user' },
          ],
        }),
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'array-item', where: { name: 'bob' } },
          value: { name: 'bob', role: 'admin' },
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      const bobItem = arr.children![1]!
      const bobMapping = bobItem.children![0]!
      const roleProp = bobMapping.children!.find((c) => c.label === 'role')
      expect(roleProp?.value).toBe('admin')
      const aliceItem = arr.children![0]!
      const aliceMapping = aliceItem.children![0]!
      const aliceRole = aliceMapping.children!.find((c) => c.label === 'role')
      expect(aliceRole?.value).toBe('user')
    })

    it('modified property with strategy append adds to inner array', () => {
      const ast = parser.parse('{"tags": ["a"]}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'tags' },
          strategy: 'append',
          value: ['b', 'c'],
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(3)
      expect(arr.children![1]).toMatchObject({ type: 'array-item', value: 'b' })
      expect(arr.children![2]).toMatchObject({ type: 'array-item', value: 'c' })
    })

    it('modified property with strategy merge-by updates matched items', () => {
      const ast = parser.parse(
        JSON.stringify({
          plugins: [
            { name: 'lint', enabled: false },
            { name: 'test', enabled: false },
          ],
        }),
      )
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: { type: 'property', matches: 'plugins' },
          strategy: 'merge-by',
          mergeKey: 'name',
          value: [{ name: 'lint', enabled: true }],
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      const lintItem = arr.children![0]!
      const lintMapping = lintItem.children![0]!
      const enabledProp = lintMapping.children!.find((c) => c.label === 'enabled')
      expect(enabledProp?.value).toBe(true)
      const testItem = arr.children![1]!
      const testMapping = testItem.children![0]!
      const testEnabled = testMapping.children!.find((c) => c.label === 'enabled')
      expect(testEnabled?.value).toBe(false)
    })

    it('modified property with parent selector disambiguates nested keys', () => {
      const ast = parser.parse('{"outer": {"name": "old"}, "inner": {"name": "keep"}}')
      const result = parser.apply(ast, [
        {
          op: 'modified',
          selector: {
            type: 'property',
            matches: 'name',
            parent: { type: 'property', matches: 'outer' },
          },
          value: 'new',
        },
      ])
      const outerProp = result.ast.root.children![0]!.children!.find((c) => c.label === 'outer')!
      const innerProp = result.ast.root.children![0]!.children!.find((c) => c.label === 'inner')!
      const outerName = outerProp.children![0]!.children![0]!
      expect(outerName.value).toBe('new')
      const innerName = innerProp.children![0]!.children![0]!
      expect(innerName.value).toBe('keep')
    })
  })

  describe('apply — removed operation for property and array-item', () => {
    it('removed property from root object', () => {
      const ast = parser.parse('{"keep": 1, "remove": 2, "also-keep": 3}')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'property', matches: 'remove' },
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(2)
      const labels = obj.children!.map((c) => c.label)
      expect(labels).toEqual(['keep', 'also-keep'])
    })

    it('removed property from nested object', () => {
      const ast = parser.parse('{"config": {"debug": true, "verbose": false}}')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: {
            type: 'property',
            matches: 'verbose',
            parent: { type: 'property', matches: 'config' },
          },
        },
      ])
      const configProp = result.ast.root.children![0]!.children![0]!
      const configObj = configProp.children![0]!
      expect(configObj.children).toHaveLength(1)
      expect(configObj.children![0]!.label).toBe('debug')
    })

    it('removed array-item by index', () => {
      const ast = parser.parse('{"items": ["a", "b", "c"]}')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'array-item', index: 1 },
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(2)
      expect(arr.children![0]).toMatchObject({ type: 'array-item', value: 'a' })
      expect(arr.children![1]).toMatchObject({ type: 'array-item', value: 'c' })
    })

    it('removed array-item by where selector', () => {
      const ast = parser.parse(JSON.stringify({ users: [{ name: 'alice' }, { name: 'bob' }] }))
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'array-item', where: { name: 'alice' } },
        },
      ])
      const arr = result.ast.root.children![0]!.children![0]!.children![0]!
      expect(arr.children).toHaveLength(1)
      const remainingItem = arr.children![0]!
      const mapping = remainingItem.children![0]!
      const nameProp = mapping.children!.find((c) => c.label === 'name')
      expect(nameProp?.value).toBe('bob')
    })

    it('removed entire array via property', () => {
      const ast = parser.parse('{"name": "core", "tags": ["a", "b"]}')
      const result = parser.apply(ast, [
        {
          op: 'removed',
          selector: { type: 'property', matches: 'tags' },
        },
      ])
      const obj = result.ast.root.children![0]!
      expect(obj.children).toHaveLength(1)
      expect(obj.children![0]!.label).toBe('name')
    })
  })

  describe('nodeTypes', () => {
    it('returns descriptors including document, object, property, array, array-item', () => {
      const types = parser.nodeTypes()
      const typeNames = types.map((t) => t.type)
      expect(typeNames).toContain('document')
      expect(typeNames).toContain('object')
      expect(typeNames).toContain('property')
      expect(typeNames).toContain('array')
      expect(typeNames).toContain('array-item')
    })
  })

  describe('outline', () => {
    it('returns property entries at correct depths', () => {
      const ast = parser.parse('{"name": "core", "version": "0.1.0"}')
      const outline = parser.outline(ast)
      expect(outline.length).toBeGreaterThanOrEqual(2)
      const names = outline.map((e) => e.label)
      expect(names).toContain('name')
      expect(names).toContain('version')
    })
  })

  describe('deltaInstructions', () => {
    it('returns non-empty string describing JSON delta format', () => {
      const instructions = parser.deltaInstructions()
      expect(typeof instructions).toBe('string')
      expect(instructions).toContain('property')
      expect(instructions).toContain('value')
    })
  })
})
