import { describe, expect, it, vi } from 'vitest'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'
import { AddPlugin } from '../../../src/application/use-cases/add-plugin.js'

/**
 * Creates a typed config-writer test double.
 *
 * @returns Config writer with spies.
 */
function makeConfigWriter(): { writer: ConfigWriter; addPlugin: ReturnType<typeof vi.fn> } {
  const addPlugin = vi.fn().mockResolvedValue(undefined)
  const writer: ConfigWriter = {
    initProject: vi.fn().mockResolvedValue({
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }),
    addPlugin,
    removePlugin: vi.fn().mockResolvedValue(undefined),
    listPlugins: vi.fn().mockResolvedValue([]),
  }
  return { writer, addPlugin }
}

describe('AddPlugin', () => {
  it('delegates to config writer addPlugin', async () => {
    const { writer, addPlugin } = makeConfigWriter()
    const useCase = new AddPlugin(writer)

    await useCase.execute({
      configPath: '/repo/specd.yaml',
      type: 'agents',
      name: '@specd/plugin-agent-claude',
      config: { key: 'value' },
    })

    expect(addPlugin).toHaveBeenCalledOnce()
    expect(addPlugin).toHaveBeenCalledWith(
      '/repo/specd.yaml',
      'agents',
      '@specd/plugin-agent-claude',
      {
        key: 'value',
      },
    )
  })
})
