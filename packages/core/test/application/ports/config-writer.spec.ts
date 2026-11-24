import { describe, expectTypeOf, it } from 'vitest'
import type {
  AddPluginOptions,
  ConfigDeclaredPlugin,
  ConfigWriter,
  InitProjectOptions,
  InitProjectResult,
} from '../../../src/application/ports/config-writer.js'

describe('ConfigWriter port interface shape', () => {
  it('declares exactly the four methods', () => {
    expectTypeOf<keyof ConfigWriter>().toEqualTypeOf<
      'initProject' | 'addPlugin' | 'removePlugin' | 'listPlugins'
    >()
  })

  it('initProject accepts InitProjectOptions and resolves InitProjectResult', () => {
    expectTypeOf<ConfigWriter['initProject']>().parameters.toEqualTypeOf<[InitProjectOptions]>()
    expectTypeOf<ConfigWriter['initProject']>().returns.toEqualTypeOf<Promise<InitProjectResult>>()
  })

  it('addPlugin accepts (configPath, name, options?) and resolves void', () => {
    expectTypeOf<ConfigWriter['addPlugin']>().parameters.toEqualTypeOf<
      [configPath: string, name: string, options?: AddPluginOptions]
    >()
    expectTypeOf<ConfigWriter['addPlugin']>().returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf<AddPluginOptions>().toEqualTypeOf<{
      readonly config?: Readonly<Record<string, unknown>>
      readonly contributions?: readonly string[]
    }>()
  })

  it('removePlugin accepts (configPath, name) and resolves void', () => {
    expectTypeOf<ConfigWriter['removePlugin']>().parameters.toEqualTypeOf<
      [configPath: string, name: string]
    >()
    expectTypeOf<ConfigWriter['removePlugin']>().returns.toEqualTypeOf<Promise<void>>()
  })

  it('listPlugins accepts (configPath) and resolves ConfigDeclaredPlugin[]', () => {
    expectTypeOf<ConfigWriter['listPlugins']>().parameters.toEqualTypeOf<[configPath: string]>()
    expectTypeOf<ConfigWriter['listPlugins']>().returns.toEqualTypeOf<
      Promise<ConfigDeclaredPlugin[]>
    >()
  })

  it('is an interface that a plain object can implement', () => {
    const impl: ConfigWriter = {
      initProject: async () => ({
        configPath: '',
        schemaRef: '',
        workspaces: [],
        metadataCachePath: '',
      }),
      addPlugin: async () => {},
      removePlugin: async () => {},
      listPlugins: async () => [],
    }
    expectTypeOf(impl).toExtend<ConfigWriter>()
  })
})
