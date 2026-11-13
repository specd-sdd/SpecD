import { describe, expect, it } from 'vitest'
import {
  InvalidPluginConfigError,
  UnsupportedSchemaKeywordError,
  assertSupportedConfigSchema,
  resolvePluginConfig,
} from '../../src/index.js'

const pluginName = '@acme/checks'

function captureError(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('plugin config schema', () => {
  it('given supported keywords, when config is resolved, then defaults apply and strict objects reject extras', () => {
    const schema = {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        mode: { type: 'string' as const, enum: ['fast', 'full'], default: 'fast' },
        count: { type: 'integer' as const },
        flags: { type: 'array' as const, items: { type: 'boolean' as const } },
        nested: { type: 'object' as const, properties: { on: { type: 'boolean' as const } } },
      },
      required: ['count'],
    }
    assertSupportedConfigSchema(pluginName, schema)
    expect(resolvePluginConfig(pluginName, schema, { count: 1, flags: [true] })).toEqual({
      mode: 'fast',
      count: 1,
      flags: [true],
    })
    expect(() => resolvePluginConfig(pluginName, schema, { count: 1, extra: true })).toThrow(
      InvalidPluginConfigError,
    )
  })

  it.each(['$ref', 'oneOf', 'patternProperties'])(
    'given unsupported keyword %s, when asserted, then names the plugin and keyword',
    (keyword) => {
      expect(() =>
        assertSupportedConfigSchema(pluginName, {
          type: 'object',
          properties: { mode: { type: 'string', [keyword]: 'x' } },
        }),
      ).toThrow(UnsupportedSchemaKeywordError)
    },
  )

  it('given a node that is not a single schema object, when asserted, then names the failing keyword', () => {
    expect(() =>
      assertSupportedConfigSchema(pluginName, {
        type: 'object',
        properties: { mode: { type: 'date' } },
      }),
    ).toThrow(UnsupportedSchemaKeywordError)
    expect(() =>
      assertSupportedConfigSchema(pluginName, { type: 'object', required: 'mode' }),
    ).toThrow(UnsupportedSchemaKeywordError)
    expect(() =>
      assertSupportedConfigSchema(pluginName, { type: 'object', additionalProperties: {} }),
    ).toThrow(UnsupportedSchemaKeywordError)
    expect(() =>
      assertSupportedConfigSchema(pluginName, {
        type: 'object',
        properties: { flags: { type: 'array', items: [{ type: 'string' }] } },
      }),
    ).toThrow(UnsupportedSchemaKeywordError)
  })

  it('given no schema, when config is omitted or present, then returns empty or rejects', () => {
    expect(resolvePluginConfig(pluginName, undefined, undefined)).toEqual({})
    expect(() => resolvePluginConfig(pluginName, undefined, { mode: 'fast' })).toThrow(
      InvalidPluginConfigError,
    )
  })

  it.each([
    ['non-array', 'fast'],
    ['empty', []],
    ['object', { a: 1 }],
  ])('given a %s enum, when asserted, then names the enum keyword', (_label, value) => {
    const schema = { type: 'object', properties: { mode: { type: 'string', enum: value } } }
    expect(() => assertSupportedConfigSchema(pluginName, schema)).toThrow(
      UnsupportedSchemaKeywordError,
    )
    try {
      assertSupportedConfigSchema(pluginName, schema)
    } catch (error) {
      expect(error).toMatchObject({ pluginName, keyword: 'enum' })
    }
  })

  it('given a malformed enum, when the validation gate is used, then resolvePluginConfig is never reached with it', () => {
    const bad = { type: 'object', properties: { mode: { type: 'string', enum: 'fast' } } }
    expect(() => assertSupportedConfigSchema(pluginName, bad)).toThrow(
      UnsupportedSchemaKeywordError,
    )
    const good = { type: 'object', properties: { mode: { type: 'string', enum: ['fast'] } } }
    assertSupportedConfigSchema(pluginName, good)
    expect(() => resolvePluginConfig(pluginName, good, { mode: 'slow' })).toThrow(
      InvalidPluginConfigError,
    )
    expect(() => resolvePluginConfig(pluginName, good, { mode: 'slow' })).not.toThrow(TypeError)
  })

  const keywordOf = (run: () => void): unknown => {
    try {
      run()
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaKeywordError)
      expect(error).toMatchObject({ pluginName })
      return (error as UnsupportedSchemaKeywordError).keyword
    }
    throw new Error('expected assertSupportedConfigSchema to throw')
  }

  it.each([['string'], [42], [null], [['object']]])(
    'given a non-object root %j, when asserted, then keyword is configSchema',
    (root) => {
      expect(keywordOf(() => assertSupportedConfigSchema(pluginName, root))).toBe('configSchema')
    },
  )

  it.each([['string'], [42], [null], [['string']]])(
    'given a non-object property node %j, when asserted, then keyword is type',
    (node) => {
      expect(
        keywordOf(() =>
          assertSupportedConfigSchema(pluginName, { type: 'object', properties: { mode: node } }),
        ),
      ).toBe('type')
    },
  )

  it('given an unsupported keyword, when asserted, then the error carries the plugin and the keyword', () => {
    expect(
      keywordOf(() => assertSupportedConfigSchema(pluginName, { type: 'object', oneOf: [] })),
    ).toBe('oneOf')
  })

  it.each([
    ['unknown type', { type: 'object', properties: { a: { type: 'date' } } }, 'type'],
    ['null type', { type: 'object', properties: { a: { type: 'null' } } }, 'type'],
    ['node without type', { type: 'object', properties: { a: { default: 1 } } }, 'type'],
    ['enum-only node', { type: 'object', properties: { a: { enum: ['x'] } } }, 'type'],
    ['required string', { type: 'object', required: 'a' }, 'required'],
    ['required non-string entry', { type: 'object', required: [1] }, 'required'],
    [
      'additionalProperties object',
      { type: 'object', additionalProperties: {} },
      'additionalProperties',
    ],
    [
      'items array',
      { type: 'object', properties: { a: { type: 'array', items: [{ type: 'string' }] } } },
      'items',
    ],
    [
      'enum non-array',
      { type: 'object', properties: { a: { type: 'string', enum: 'x' } } },
      'enum',
    ],
    [
      'enum with object entry',
      { type: 'object', properties: { a: { type: 'string', enum: [{ x: 1 }] } } },
      'enum',
    ],
    [
      'enum with null entry',
      { type: 'object', properties: { a: { type: 'string', enum: [null] } } },
      'enum',
    ],
  ])('given %s, when asserted, then keyword is %s', (_label, schema, keyword) => {
    expect(keywordOf(() => assertSupportedConfigSchema(pluginName, schema))).toBe(keyword)
  })

  it('given enum entries of string, number and boolean, when asserted, then accepted', () => {
    expect(() =>
      assertSupportedConfigSchema(pluginName, {
        type: 'object',
        properties: { a: { type: 'string', enum: ['x', 1, true] } },
      }),
    ).not.toThrow()
  })

  it('given an unvalidated malformed schema, when config is resolved, then a typed error is raised and never a TypeError', () => {
    const bad = { type: 'object', properties: { mode: { type: 'string', enum: 'fast' } } }
    let failure: unknown
    try {
      resolvePluginConfig(pluginName, bad as never, { mode: 'fast' })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(UnsupportedSchemaKeywordError)
    expect(failure).not.toBeInstanceOf(TypeError)
    expect(failure).toMatchObject({ pluginName, keyword: 'enum' })
    expect(() => resolvePluginConfig(pluginName, 'nope' as never, {})).toThrow(
      UnsupportedSchemaKeywordError,
    )
  })

  it('given config but no configSchema, when resolved, then the issue reads "config given but no configSchema declared"', () => {
    let failure: unknown
    try {
      resolvePluginConfig(pluginName, undefined, { a: 1 })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(InvalidPluginConfigError)
    expect((failure as InvalidPluginConfigError).issues).toEqual([
      'config given but no configSchema declared',
    ])
  })

  it('given properties that is an array, when asserted, then keyword properties is reported', () => {
    const failure = captureError(() =>
      assertSupportedConfigSchema(pluginName, { type: 'object', properties: [] }),
    )
    expect(failure).toMatchObject({ keyword: 'properties' })
  })

  it('given nesting of exactly 32 levels, when asserted, then it is accepted', () => {
    let schema: Record<string, unknown> = { type: 'string' }
    for (let depth = 0; depth < 32; depth += 1)
      schema = { type: 'object', properties: { c: schema } }
    expect(() => assertSupportedConfigSchema(pluginName, schema)).not.toThrow()
  })

  it('given nesting of exactly 33 levels, when asserted, then it is rejected', () => {
    let schema: Record<string, unknown> = { type: 'string' }
    for (let depth = 0; depth < 33; depth += 1)
      schema = { type: 'object', properties: { c: schema } }
    expect(() => assertSupportedConfigSchema(pluginName, schema)).toThrow(
      UnsupportedSchemaKeywordError,
    )
  })

  it.each([
    [
      'properties',
      (inner: Record<string, unknown>) => ({ type: 'object', properties: { c: inner } }),
    ],
    ['items', (inner: Record<string, unknown>) => ({ type: 'array', items: inner })],
  ])(
    'given nesting deeper than 32 levels through %s, then UnsupportedSchemaKeywordError and no stack overflow',
    (keyword, wrap) => {
      let schema: Record<string, unknown> = { type: 'string' }
      for (let depth = 0; depth < 200_000; depth += 1) schema = wrap(schema)
      const root = { type: 'object', properties: { c: schema } }
      expect(captureError(() => assertSupportedConfigSchema(pluginName, root))).toMatchObject({
        keyword,
      })
      expect(() => resolvePluginConfig(pluginName, root as never, {})).toThrowError(
        UnsupportedSchemaKeywordError,
      )
    },
  )
})
