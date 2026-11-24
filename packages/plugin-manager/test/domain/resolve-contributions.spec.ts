import { describe, expect, it } from 'vitest'
import { UnknownContributionError, resolveContributions } from '../../src/index.js'
import type { SpecdPluginManifest } from '../../src/index.js'

const manifest: SpecdPluginManifest = {
  schemaVersion: 2,
  name: '@acme/checks',
  version: '1.0.0',
  minCoreVersion: '*',
  contributes: { agents: { claude: {} }, checks: { lint: {}, scan: {} } },
}

describe('resolveContributions', () => {
  it('given no allowlist, when resolved, then returns every declared id', () => {
    expect(resolveContributions('@acme/checks', manifest, undefined)).toEqual([
      'claude',
      'lint',
      'scan',
    ])
  })

  it('given an allowlist, when resolved, then keeps that subset', () => {
    expect(resolveContributions('@acme/checks', manifest, ['scan'])).toEqual(['scan'])
  })

  it('given an unknown id, when resolved, then throws', () => {
    expect(() => resolveContributions('@acme/checks', manifest, ['missing'])).toThrow(
      UnknownContributionError,
    )
  })
})
