import { describe, expect, it } from 'vitest'
import { makeMockConfig } from '../helpers.js'
import {
  findDeclaredPlugin,
  getDeclaredPlugins,
} from '../../../src/commands/plugins/get-declared-plugins.js'

describe('getDeclaredPlugins', () => {
  it('given a flat plugins list, when queried, then returns entries', () => {
    const config = makeMockConfig({
      plugins: [{ name: '@specd/plugin-agent-claude' }],
    })

    expect(getDeclaredPlugins(config)).toEqual([{ name: '@specd/plugin-agent-claude' }])
  })

  it('given a named plugin, when found, then returns that entry', () => {
    const config = makeMockConfig({
      plugins: [{ name: '@specd/plugin-agent-claude', contributions: ['claude'] }],
    })

    expect(findDeclaredPlugin(config, '@specd/plugin-agent-claude')).toEqual({
      name: '@specd/plugin-agent-claude',
      contributions: ['claude'],
    })
  })

  it('given plugins undefined, when queried, then returns empty list', () => {
    expect(getDeclaredPlugins(makeMockConfig())).toEqual([])
  })
})
