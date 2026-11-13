import { describe, expect, it } from 'vitest'
import { createConfigWriter } from '@specd/core'
import type { ConfigDeclaredPlugin, ConfigWriter } from '@specd/core/ports'
import type { DeclaredPlugin, PluginRepositoryPort } from '../../src/index.js'

type ConfigWriterConforms = ConfigWriter extends PluginRepositoryPort ? true : false

describe('PluginRepositoryPort', () => {
  it('given ConfigWriter, when assigned to the port, then the methods match', () => {
    const conforms: ConfigWriterConforms = true
    expect(conforms).toBe(true)
  })

  it('given DeclaredPlugin, when compared with ConfigDeclaredPlugin, then both types are identical', () => {
    const forward: DeclaredPlugin extends ConfigDeclaredPlugin ? true : false = true
    const backward: ConfigDeclaredPlugin extends DeclaredPlugin ? true : false = true
    expect([forward, backward]).toEqual([true, true])
  })

  it('given a port, when listPlugins is typed, then it returns a readonly array assignable from a mutable one', async () => {
    const mutable: DeclaredPlugin[] = [{ name: '@acme/x' } as DeclaredPlugin]
    const port: PluginRepositoryPort = {
      addPlugin: async () => {},
      removePlugin: async () => {},
      listPlugins: async () => mutable,
    }
    const listed: readonly DeclaredPlugin[] = await port.listPlugins('/tmp/specd.yaml')
    expect(listed).toHaveLength(1)
  })

  describe('runtime conformance mirroring the port', () => {
    /** Mirrors the port: every method name with its maximum arity (fakes may declare fewer parameters). */
    const PORT_METHODS = { addPlugin: 3, removePlugin: 2, listPlugins: 1 } as const

    /** Returns the port members that are absent or not callable with the mirrored arity. */
    function violations(candidate: object): string[] {
      const bad: string[] = []
      for (const [name, max] of Object.entries(PORT_METHODS)) {
        const member = (candidate as Record<string, unknown>)[name]
        if (typeof member !== 'function' || member.length > max) {
          bad.push(name)
        }
      }
      return bad
    }

    it('given the real ConfigWriter, when checked at runtime, then it has no violations', () => {
      const writer = createConfigWriter()
      expect(violations(writer)).toEqual([])
    })

    it('given an object missing a method, when checked at runtime, then the method is reported', () => {
      const partial = { addPlugin: async () => {}, listPlugins: async () => [] }
      expect(violations(partial)).toEqual(['removePlugin'])
    })

    it('given an object whose method is not a function, when checked at runtime, then it is reported', () => {
      const mistyped = {
        addPlugin: async () => {},
        removePlugin: 'nope',
        listPlugins: async () => [],
      }
      expect(violations(mistyped)).toEqual(['removePlugin'])
    })
  })
})
