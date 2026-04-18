import { describe, expect, it, vi } from 'vitest'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'
import { RemovePlugin } from '../../../src/application/use-cases/remove-plugin.js'

/**
 * Creates a typed config-writer test double.
 *
 * @returns Config writer with spies.
 */
function makeConfigWriter(): { writer: ConfigWriter; removePlugin: ReturnType<typeof vi.fn> } {
  const removePlugin = vi.fn().mockResolvedValue(undefined)
  const writer: ConfigWriter = {
    initProject: vi.fn().mockResolvedValue({
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }),
    addPlugin: vi.fn().mockResolvedValue(undefined),
    removePlugin,
    listPlugins: vi.fn().mockResolvedValue([]),
  }
  return { writer, removePlugin }
}

describe('RemovePlugin', () => {
  it('delegates to config writer removePlugin', async () => {
    const { writer, removePlugin } = makeConfigWriter()
    const useCase = new RemovePlugin(writer)

    await useCase.execute({
      configPath: '/repo/specd.yaml',
      type: 'agents',
      name: '@specd/plugin-agent-claude',
    })

    expect(removePlugin).toHaveBeenCalledOnce()
    expect(removePlugin).toHaveBeenCalledWith(
      '/repo/specd.yaml',
      'agents',
      '@specd/plugin-agent-claude',
    )
  })
})
