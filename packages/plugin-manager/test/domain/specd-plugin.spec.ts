import { describe, expect, it } from 'vitest'
import { InvalidContributionAddressError } from '../../src/index.js'
import {
  buildContributionAddress,
  isSpecdPlugin,
  parseContributionAddress,
} from '../../src/index.js'

const plugin = {
  name: '@acme/specd-compliance',
  version: '1.0.0',
  init: async () => {},
  destroy: async () => {},
}

describe('plugin name and contribution address', () => {
  it('given a scoped name, when building an address, then joins with one dot', () => {
    expect(buildContributionAddress('@specd/plugin-agent-claude', 'claude')).toBe(
      '@specd/plugin-agent-claude.claude',
    )
    expect(parseContributionAddress('@acme/specd-compliance.audit')).toEqual({
      pluginName: '@acme/specd-compliance',
      id: 'audit',
    })
  })

  it('given an address with zero or two dots, when parsed or built, then throws the address error', () => {
    expect(() => parseContributionAddress('@acme/plugin')).toThrow(InvalidContributionAddressError)
    expect(() => parseContributionAddress('@acme/plugin.id.extra')).toThrow(
      InvalidContributionAddressError,
    )
    expect(() => buildContributionAddress('my-plugin', 'audit')).toThrow(
      InvalidContributionAddressError,
    )
    expect(() => buildContributionAddress('@acme/plugin', 'Bad.Id')).toThrow(
      InvalidContributionAddressError,
    )
  })

  it('given a plugin value, when checked, then accepts hooks that are absent and rejects a bad name or hook', () => {
    expect(isSpecdPlugin(plugin)).toBe(true)
    expect(isSpecdPlugin({ ...plugin, name: 'my-plugin' })).toBe(false)
    expect(isSpecdPlugin({ ...plugin, install: 'nope' })).toBe(false)
  })

  it.each([
    ['@acme/my-plugin', true],
    ['@ac.me/plugin', false],
    ['@specd/plugin-agent-claude', true],
    ['@acme/my.plugin', false],
    ['@Acme/my-plugin', false],
    ['@acme/My-Plugin', false],
    ['my-plugin', false],
  ])('given plugin name %s, when checked as a plugin, then validity is %s', (name, valid) => {
    expect(isSpecdPlugin({ ...plugin, name })).toBe(valid)
  })

  it.each(['acme.a', '@acme/x.A', '@acme/x.', '.a', '@acme/x.a.b'])(
    'given address %s, when parsed, then throws the single address error class',
    (address) => {
      expect(() => parseContributionAddress(address)).toThrow(InvalidContributionAddressError)
    },
  )

  it('given the SpecdPlugin contract, when a plugin has no type or configSchema, then it is still valid', () => {
    expect('type' in plugin).toBe(false)
    expect('configSchema' in plugin).toBe(false)
    expect(isSpecdPlugin(plugin)).toBe(true)
  })
})
