import { describe, expect, it } from 'vitest'
import { PluginValidationError, agentsContributionHandler } from '../../src/index.js'

describe('agentsContributionHandler', () => {
  it('given an empty block, when parsed, then accepts it and has no activate', () => {
    expect(agentsContributionHandler.kind).toBe('agents')
    expect(agentsContributionHandler.activate).toBeUndefined()
    expect(agentsContributionHandler.blockSchema.safeParse({ claude: {} }).success).toBe(true)
  })

  it('given an unknown field, when parsed, then rejects the block', () => {
    expect(
      agentsContributionHandler.blockSchema.safeParse({ claude: { extra: true } }).success,
    ).toBe(false)
  })

  it('given a plugin that lacks install and uninstall, when validated, then a PluginValidationError names the plugin and hooks', () => {
    const plugin = {
      name: '@acme/a',
      version: '1.0.0',
      init: async () => {},
      destroy: async () => {},
    }
    let failure: unknown
    try {
      agentsContributionHandler.validatePlugin?.(plugin, '@acme/a')
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ pluginName: '@acme/a', fields: ['install', 'uninstall'] })
  })

  it('given an id that breaks the id rules, when parsed, then the block is rejected', () => {
    expect(agentsContributionHandler.blockSchema.safeParse({ 'Bad.Id': {} }).success).toBe(false)
  })
})
