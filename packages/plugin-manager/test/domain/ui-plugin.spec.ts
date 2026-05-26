import { describe, expect, it } from 'vitest'
import { createBundleUiPlugin, createServerUiPlugin, isUiPlugin } from '../../src/index.js'

describe('UiPlugin', () => {
  it('bundle plugin has hasServer false and static root', () => {
    const plugin = createBundleUiPlugin({
      name: '@specd/plugin-ui-studio',
      version: '0.1.0',
      packageRoot: '/tmp/pkg',
      staticDir: 'dist',
    })
    expect(isUiPlugin(plugin)).toBe(true)
    expect(plugin.hasServer()).toBe(false)
    expect(plugin.getStaticRoot()).toBe('/tmp/pkg/dist')
  })

  it('server plugin has hasServer true and server URL', () => {
    const plugin = createServerUiPlugin({
      name: '@specd/studio-web',
      version: '0.0.0',
      packageRoot: '/tmp/web',
      serverPort: 5174,
    })
    expect(isUiPlugin(plugin)).toBe(true)
    expect(plugin.hasServer()).toBe(true)
    expect(plugin.getServerUrl?.()).toBe('http://127.0.0.1:5174')
  })
})
