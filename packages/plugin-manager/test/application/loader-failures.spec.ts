import { describe, expect, it } from 'vitest'
import { SpecdError } from '@specd/core'
import {
  InstallPlugin,
  LoadPlugin,
  PluginNotFoundError,
  PluginValidationError,
  UninstallPlugin,
  UpdatePlugin,
} from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const plainFailure = new Error('disk unplugged')
const plainLoader: PluginLoader = {
  load: async () => {
    throw plainFailure
  },
}
const missingLoader: PluginLoader = {
  load: async (name) => {
    throw new PluginNotFoundError(name)
  },
}

const cases = [
  [
    'InstallPlugin',
    (loader: PluginLoader) =>
      new InstallPlugin(loader).execute({ pluginName: '@acme/x', config: makeMockConfig() }),
  ],
  [
    'UninstallPlugin',
    (loader: PluginLoader) =>
      new UninstallPlugin(loader).execute({ pluginName: '@acme/x', config: makeMockConfig() }),
  ],
  [
    'UpdatePlugin',
    (loader: PluginLoader) =>
      new UpdatePlugin(loader).execute({ pluginName: '@acme/x', config: makeMockConfig() }),
  ],
  [
    'LoadPlugin',
    (loader: PluginLoader) => new LoadPlugin(loader).execute({ pluginName: '@acme/x' }),
  ],
] as const

describe('plugin use cases surface only SpecdError when the loader fails', () => {
  it.each(cases)(
    '%s wraps a plain loader error in PluginValidationError(load)',
    async (_n, run) => {
      const failure: unknown = await run(plainLoader).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(SpecdError)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({
        pluginName: '@acme/x',
        fields: ['load'],
        cause: plainFailure,
      })
      expect((failure as Error).message).toContain('disk unplugged')
    },
  )

  it.each(cases)('%s lets a SpecdError from the loader through unchanged', async (_n, run) => {
    const failure: unknown = await run(missingLoader).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginNotFoundError)
  })

  it.each(cases)('%s treats a malformed loader result as a load failure', async (_n, run) => {
    for (const value of [undefined, null, {}, { plugin: {} }, { manifest: {} }]) {
      const loader: PluginLoader = { load: async () => value as never }
      const failure: unknown = await run(loader).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: '@acme/x', fields: ['load'] })
    }
  })

  it.each(cases)('%s records a thrown undefined as the cause', async (_n, run) => {
    const loader: PluginLoader = {
      load: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw undefined
      },
    }
    const failure: unknown = await run(loader).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect('cause' in (failure as object)).toBe(true)
    expect((failure as PluginValidationError).cause).toBeUndefined()
  })

  it.each(cases)(
    '%s wraps a hostile Proxy rejection and keeps it as the cause',
    async (_n, run) => {
      const hostile = new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('trap')
          },
        },
      )
      const loader: PluginLoader = {
        load: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw hostile
        },
      }
      const failure: unknown = await run(loader).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: '@acme/x', fields: ['load'] })
      expect((failure as PluginValidationError).cause).toBe(hostile)
    },
  )

  it.each(cases)(
    '%s treats a manifest without a contributes map as a load failure',
    async (_n, run) => {
      const plugin = { name: '@acme/x', version: '1.0.0' }
      for (const manifest of [
        {},
        { contributes: null },
        { contributes: 5 },
        { contributes: { agents: null } },
      ]) {
        const loader: PluginLoader = { load: async () => ({ plugin, manifest }) as never }
        const failure: unknown = await run(loader).catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(PluginValidationError)
        expect(failure).toMatchObject({ pluginName: '@acme/x', fields: ['load'] })
      }
    },
  )
})
