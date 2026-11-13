import { describe, expect, it } from 'vitest'
import { SpecdError } from '@specd/core'
import * as api from '../../src/index.js'
import {
  DuplicateContributionError,
  DuplicateHandlerKindError,
  InvalidContributionAddressError,
  InvalidPluginConfigError,
  PluginDestroyError,
  PluginInitError,
  PluginNotFoundError,
  PluginValidationError,
  UnknownContributionError,
  UnknownContributionKindError,
  UnsupportedSchemaKeywordError,
} from '../../src/index.js'

describe('plugin errors', () => {
  it('given each error, when constructed, then exposes its code and plugin name', () => {
    const duplicate = new DuplicateContributionError('@acme/checks', 'lint')
    const unknown = new UnknownContributionError('@acme/checks', 'scan')
    const kind = new UnknownContributionKindError('@acme/checks', 'checks')
    const invalid = new InvalidPluginConfigError('@acme/checks', ['mode: required'])
    const keyword = new UnsupportedSchemaKeywordError('@acme/checks', '$ref')
    const cause = new Error('boom')
    const init = new PluginInitError('@acme/checks', cause)

    expect(duplicate.code).toBe('DUPLICATE_CONTRIBUTION_ID')
    expect(unknown.code).toBe('UNKNOWN_CONTRIBUTION')
    expect(kind.code).toBe('UNKNOWN_CONTRIBUTION_KIND')
    expect(invalid.code).toBe('INVALID_PLUGIN_CONFIG')
    expect(keyword.code).toBe('UNSUPPORTED_SCHEMA_KEYWORD')
    expect(init.code).toBe('PLUGIN_INIT_FAILED')
    expect(init.pluginName).toBe('@acme/checks')
    expect(init.cause).toBe(cause)
    expect(init.message).toContain('boom')
    expect(init.message).toContain('@acme/checks')
    expect(unknown.pluginName).toBe('@acme/checks')
    expect(kind.kind).toBe('checks')

    const duplicateKind = new DuplicateHandlerKindError('agents')
    expect(duplicateKind.code).toBe('DUPLICATE_HANDLER_KIND')
    expect(duplicateKind.kind).toBe('agents')
    expect(duplicateKind.message).toContain('agents')

    const address = new InvalidContributionAddressError('@acme/plugin.id.extra')
    expect(address.code).toBe('INVALID_CONTRIBUTION_ADDRESS')
    expect(address.address).toBe('@acme/plugin.id.extra')
    expect(address.message).toContain('@acme/plugin.id.extra')

    const validation = new PluginValidationError('@acme/checks', ['destroy'], cause)
    expect(validation.fields).toEqual(['destroy'])
    expect(validation.cause).toBe(cause)
    expect(validation.message).toContain('@acme/checks')
  })

  it('given each plugin-named class, when constructed with @acme/x, then the message names the plugin', () => {
    const plugin = '@acme/x'
    const errors: SpecdError[] = [
      new PluginNotFoundError(plugin),
      new PluginValidationError(plugin, ['name']),
      new DuplicateContributionError(plugin, 'a'),
      new UnknownContributionError(plugin, 'a'),
      new UnknownContributionKindError(plugin, 'widgets'),
      new InvalidPluginConfigError(plugin, ['mode: required']),
      new UnsupportedSchemaKeywordError(plugin, '$ref'),
      new PluginInitError(plugin, new Error('boom')),
    ]
    for (const error of errors) expect(error.message).toContain(plugin)
    expect(new PluginNotFoundError(plugin).pluginName).toBe(plugin)
    expect(new PluginNotFoundError(plugin).code).toBe('PLUGIN_NOT_FOUND')
  })

  it('given DuplicateHandlerKindError, when constructed, then it names the kind and has no pluginName', () => {
    const error = new DuplicateHandlerKindError('agents')
    expect(error.message).toContain('agents')
    expect('pluginName' in error).toBe(false)
  })

  it('given each error, when constructed, then the message states how to fix it', () => {
    const messages = [
      new PluginNotFoundError('@acme/x').message,
      new UnknownContributionError('@acme/x', 'a').message,
      new UnsupportedSchemaKeywordError('@acme/x', '$ref').message,
      new DuplicateHandlerKindError('agents').message,
    ]
    for (const message of messages) expect(message).toMatch(/install|use only|register|supported/i)
  })

  it('given PluginDestroyError, when constructed, then keeps the failures in order', () => {
    const first = new Error('a')
    const error = new PluginDestroyError([first, 'b'], ['@acme/c', '@acme/a'])
    expect(error.code).toBe('PLUGIN_DESTROY_FAILED')
    expect(error.errors).toEqual([first, 'b'])
    expect(error.pluginNames).toEqual(['@acme/c', '@acme/a'])
    expect(error.message).toContain('@acme/c')
    expect(error.message).toContain('@acme/a')
    expect(error.message).toContain('a')
    expect(error.message).toContain('b')
  })

  it('given PluginValidationError, when the cause is an explicit undefined, then cause is still recorded', () => {
    const withUndefined = new PluginValidationError('@acme/x', ['load'], undefined)
    expect('cause' in withUndefined).toBe(true)
    expect(withUndefined.cause).toBeUndefined()
    const without = new PluginValidationError('@acme/x', ['load'])
    expect('cause' in without).toBe(false)
  })

  it('given a non-Error cause with a string message, when wrapped, then the message is visible', () => {
    const error = new PluginValidationError('@acme/x', ['load'], { message: 'plain object' })
    expect(error.message).toContain('plain object')
  })

  it('given every error class exported by the package, then each is a SpecdError with a non-empty code', () => {
    const samples: Record<string, SpecdError> = {
      PluginNotFoundError: new PluginNotFoundError('@acme/x'),
      PluginValidationError: new PluginValidationError('@acme/x', ['name']),
      DuplicateContributionError: new DuplicateContributionError('@acme/x', 'a'),
      UnknownContributionError: new UnknownContributionError('@acme/x', 'a'),
      UnknownContributionKindError: new UnknownContributionKindError('@acme/x', 'k'),
      InvalidPluginConfigError: new InvalidPluginConfigError('@acme/x', ['i']),
      UnsupportedSchemaKeywordError: new UnsupportedSchemaKeywordError('@acme/x', '$ref'),
      PluginInitError: new PluginInitError('@acme/x', new Error('boom')),
      PluginDestroyError: new PluginDestroyError([new Error('boom')], ['@acme/x']),
      DuplicateHandlerKindError: new DuplicateHandlerKindError('agents'),
      InvalidContributionAddressError: new InvalidContributionAddressError('bad'),
    }
    const exported = Object.entries(api).filter(
      ([name, value]) =>
        typeof value === 'function' &&
        name.endsWith('Error') &&
        (value as { prototype?: unknown }).prototype instanceof Error,
    )
    expect(exported.length).toBeGreaterThan(0)
    for (const [name, value] of exported) {
      expect((value as { prototype: unknown }).prototype, name).toBeInstanceOf(SpecdError)
      const sample = samples[name]
      expect(sample, `${name} needs a sample in this test`).toBeDefined()
      expect(sample).toBeInstanceOf(value as new (...args: never[]) => Error)
      expect(sample).toBeInstanceOf(SpecdError)
      expect(sample?.code.length).toBeGreaterThan(0)
    }
  })

  it('given a PluginValidationError, when constructed, then it has the stable code', () => {
    expect(new PluginValidationError('@acme/x', ['name']).code).toBe('PLUGIN_VALIDATION_ERROR')
  })

  it('given a wrapped cause, when constructed, then the message includes the cause message', () => {
    const cause = new Error('disk full')
    const error = new PluginValidationError('@acme/x', ['install'], cause)
    expect(error.message).toContain('disk full')
    expect(error.message).toContain('@acme/x')
    expect(error.cause).toBe(cause)
    expect(new PluginValidationError('@acme/x', ['install'], 'plain text').message).toContain(
      'plain text',
    )
  })

  it('given a non-object schema node, when UnsupportedSchemaKeywordError is raised for it, then the keyword is configSchema for the root and type for a nested node', () => {
    const raise = (schema: unknown): unknown => {
      try {
        api.assertSupportedConfigSchema('@acme/x', schema)
      } catch (error) {
        return error
      }
      return undefined
    }
    expect(raise('nope')).toMatchObject({ keyword: 'configSchema', pluginName: '@acme/x' })
    expect(raise({ type: 'object', properties: { a: 1 } })).toMatchObject({
      keyword: 'type',
      pluginName: '@acme/x',
    })
  })

  it('given a shape violation, when UnsupportedSchemaKeywordError is built with a reason, then the message states the reason and not "unsupported keyword"', () => {
    const error = new UnsupportedSchemaKeywordError(
      '@acme/x',
      'enum',
      'it must be a non-empty array',
    )
    expect(error.message).toContain("invalid 'enum'")
    expect(error.message).toContain('it must be a non-empty array')
    expect(error.message).not.toContain('unsupported keyword')
    expect(new UnsupportedSchemaKeywordError('@acme/x', '$ref').message).toContain(
      "unsupported keyword '$ref'",
    )
  })
})
