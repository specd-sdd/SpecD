import { describe, expect, it } from 'vitest'
import { JsonParser } from '../../../src/infrastructure/artifact-parser/json-parser.js'
import { DeltaApplicationError } from '../../../src/application/ports/artifact-parser.js'

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
      const prop = result.root.children![0]!.children![0]!
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
      const arr = result.root.children![0]!.children![0]!.children![0]!
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
      const arr = result.root.children![0]!.children![0]!.children![0]!
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
      const arr = result.root.children![0]!.children![0]!.children![0]!
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
      const obj = result.root.children![0]!
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
