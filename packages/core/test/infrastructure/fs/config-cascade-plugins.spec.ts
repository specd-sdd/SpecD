import { describe, expect, it } from 'vitest'
import {
  mergeActiveLayers,
  type ConfigCascadeLayer,
} from '../../../src/infrastructure/fs/config-cascade.js'

function layer(
  name: string,
  raw: Record<string, unknown>,
  removal?: ConfigCascadeLayer['removal'],
): ConfigCascadeLayer {
  return {
    path: `/p/${name}`,
    dir: '/p',
    raw,
    extendsMode: name === 'specd.yaml' ? 'standalone' : 'previous',
    removal,
  }
}

describe('mergeActiveLayers plugin removals', () => {
  it('does not mutate the previous layer plugins array when a later layer removes a plugin', () => {
    const rootPlugins = [{ name: '@acme/a' }, { name: '@acme/b' }]
    const overlayPlugins = [{ name: '@acme/c' }]
    const layers = [
      layer('specd.yaml', { configVersion: 2, plugins: rootPlugins }),
      layer('specd.local.yaml', { plugins: overlayPlugins }, { plugins: [{ name: '@acme/a' }] }),
    ]
    const cascade = { rootPath: '/p/specd.yaml', activeLayers: layers }

    const first = mergeActiveLayers(cascade)
    const second = mergeActiveLayers(cascade)

    expect(first['plugins']).toEqual([{ name: '@acme/b' }, { name: '@acme/c' }])
    expect(second['plugins']).toEqual(first['plugins'])
    expect(rootPlugins).toEqual([{ name: '@acme/a' }, { name: '@acme/b' }])
    expect(layers[0]!.raw['plugins']).toEqual([{ name: '@acme/a' }, { name: '@acme/b' }])
    expect(overlayPlugins).toEqual([{ name: '@acme/c' }])
  })

  it('does not mutate the root plugins array when the overlay declares no plugins', () => {
    const rootPlugins = [{ name: '@acme/a' }, { name: '@acme/b' }]
    const layers = [
      layer('specd.yaml', { configVersion: 2, plugins: rootPlugins }),
      layer('specd.local.yaml', {}, { plugins: [{ name: '@acme/b' }] }),
    ]
    const cascade = { rootPath: '/p/specd.yaml', activeLayers: layers }

    const merged = mergeActiveLayers(cascade)

    expect(merged['plugins']).toEqual([{ name: '@acme/a' }])
    expect(merged['plugins']).not.toBe(rootPlugins)
    expect(rootPlugins).toEqual([{ name: '@acme/a' }, { name: '@acme/b' }])
  })
})
