import { describe, expect, it } from 'vitest'
import {
  UiPluginBundleMissingError,
  UiPluginNotConfiguredError,
  UiPluginTypeMismatchError,
} from '../../../src/application/errors/index.js'
import type { SpecdConfig } from '../../../src/application/specd-config.js'

describe('UI plugin errors', () => {
  it('UiPluginNotConfiguredError has stable code', () => {
    const err = new UiPluginNotConfiguredError()
    expect(err.code).toBe('UI_PLUGIN_NOT_CONFIGURED')
    expect(err.specd).toBe(true)
    expect(err.message).toContain('specd plugins install')
    expect(err.message).not.toContain('Add plugins.ui')
  })

  it('UiPluginTypeMismatchError exposes pluginName', () => {
    const err = new UiPluginTypeMismatchError('@specd/plugin-agent-standard')
    expect(err.code).toBe('UI_PLUGIN_TYPE_MISMATCH')
    expect(err.pluginName).toBe('@specd/plugin-agent-standard')
  })

  it('UiPluginBundleMissingError exposes staticRoot', () => {
    const err = new UiPluginBundleMissingError('/tmp/dist')
    expect(err.code).toBe('UI_PLUGIN_BUNDLE_MISSING')
    expect(err.staticRoot).toBe('/tmp/dist')
  })
})
