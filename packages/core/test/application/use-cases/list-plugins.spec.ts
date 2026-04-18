import { describe, expect, it, vi } from 'vitest'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'
import { ListPlugins } from '../../../src/application/use-cases/list-plugins.js'

/**
 * Creates a typed config-writer test double.
 *
 * @returns Config writer with spies.
 */
function makeConfigWriter(overrides: Partial<ConfigWriter> = {}): {
  writer: ConfigWriter
  listPlugins: ReturnType<typeof vi.fn>
} {
  const listPlugins = vi.fn().mockResolvedValue([{ name: '@specd/plugin-agent-claude' }])
  const writer: ConfigWriter = {
    initProject: vi.fn().mockResolvedValue({
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }),
    addPlugin: vi.fn().mockResolvedValue(undefined),
    removePlugin: vi.fn().mockResolvedValue(undefined),
    listPlugins,
    ...overrides,
  }
  return { writer, listPlugins }
}

describe('ListPlugins', () => {
  it('delegates to config writer listPlugins', async () => {
    const { writer, listPlugins } = makeConfigWriter()
    const useCase = new ListPlugins(writer)

    const result = await useCase.execute({
      configPath: '/repo/specd.yaml',
      type: 'agents',
    })

    expect(listPlugins).toHaveBeenCalledWith('/repo/specd.yaml', 'agents')
    expect(result).toEqual([{ name: '@specd/plugin-agent-claude' }])
  })
})
