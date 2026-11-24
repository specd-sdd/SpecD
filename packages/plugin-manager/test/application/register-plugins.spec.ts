import { describe, expect, it, vi } from 'vitest'
import { Logger, SpecdError } from '@specd/core'
import { z } from 'zod'
import type { KernelBuilder } from '@specd/core/extensions'
import {
  DuplicateHandlerKindError,
  InvalidPluginConfigError,
  PluginDestroyError,
  PluginNotFoundError,
  PluginValidationError,
  UnknownContributionError,
  PluginInitError,
  createPluginLoader,
  registerPlugins,
} from '../../src/index.js'
import type { PluginLoader, SpecdPlugin, SpecdPluginManifest } from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

function manifest(name: string, overrides: Partial<SpecdPluginManifest> = {}): SpecdPluginManifest {
  return {
    schemaVersion: 2,
    name,
    version: '1.0.0',
    minCoreVersion: '*',
    contributes: { agents: { main: {} } },
    ...overrides,
  }
}

function plugin(name: string, overrides: Partial<SpecdPlugin> = {}): SpecdPlugin {
  return {
    name,
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    install: async () => {},
    uninstall: async () => {},
    ...overrides,
  }
}

function builder(): KernelBuilder & { disposers: Map<string, () => Promise<void>> } {
  const disposers = new Map<string, () => Promise<void>>()
  return {
    disposers,
    registerDisposer(name: string, dispose: () => Promise<void>) {
      disposers.set(name, dispose)
    },
  } as KernelBuilder & { disposers: Map<string, () => Promise<void>> }
}

function loaderFor(
  entries: Record<string, { plugin: SpecdPlugin; manifest: SpecdPluginManifest }>,
): PluginLoader {
  return {
    load: vi.fn(async (name: string) => {
      const found = entries[name]
      if (found === undefined) throw new Error(`missing ${name}`)
      return found
    }),
  }
}

describe('registerPlugins', () => {
  it('given an empty list, when registered, then no disposer is registered', async () => {
    const kernel = builder()
    const load = vi.fn()
    const registration = await registerPlugins(kernel, makeMockConfig(), { loader: { load } })
    await registration.dispose()
    expect(load).not.toHaveBeenCalled()
    expect(kernel.disposers.size).toBe(0)
  })

  it('given declared plugins, when registered, then init runs in order and one disposer destroys in reverse', async () => {
    const order: string[] = []
    const first = plugin('@acme/first', {
      init: async () => {
        order.push('init:first')
      },
      destroy: async () => {
        order.push('destroy:first')
      },
    })
    const second = plugin('@acme/second', {
      init: async () => {
        order.push('init:second')
      },
      destroy: async () => {
        order.push('destroy:second')
      },
    })
    const kernel = builder()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    const registration = await registerPlugins(kernel, config, {
      loader: loaderFor({
        '@acme/first': { plugin: first, manifest: manifest('@acme/first') },
        '@acme/second': { plugin: second, manifest: manifest('@acme/second') },
      }),
    })
    expect(order).toEqual(['init:first', 'init:second'])
    expect(kernel.disposers.size).toBe(1)
    await registration.dispose()
    await registration.dispose()
    expect(order).toEqual(['init:first', 'init:second', 'destroy:second', 'destroy:first'])
  })

  it('given a failing init, when registered, then prior plugins are destroyed and no disposer is kept', async () => {
    const destroyed: string[] = []
    const kernel = builder()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    await expect(
      registerPlugins(kernel, config, {
        loader: loaderFor({
          '@acme/first': {
            plugin: plugin('@acme/first', {
              destroy: async () => {
                destroyed.push('first')
              },
            }),
            manifest: manifest('@acme/first'),
          },
          '@acme/second': {
            plugin: plugin('@acme/second', {
              init: async () => {
                throw new Error('boom')
              },
            }),
            manifest: manifest('@acme/second'),
          },
        }),
      }),
    ).rejects.toMatchObject({ pluginName: '@acme/second' })
    expect(destroyed).toEqual(['first'])
    expect(kernel.disposers.size).toBe(0)
  })

  it('given invalid selection, when registered, then init is not called', async () => {
    const init = vi.fn(async () => {})
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/checks', contributions: ['missing'] }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/checks': {
            plugin: plugin('@acme/checks', { init }),
            manifest: manifest('@acme/checks'),
          },
        }),
      }),
    ).rejects.toBeInstanceOf(UnknownContributionError)
    expect(init).not.toHaveBeenCalled()
  })

  it('given config without a schema, when registered, then throws before init', async () => {
    const init = vi.fn(async () => {})
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/checks', config: { mode: 'fast' } }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/checks': {
            plugin: plugin('@acme/checks', { init }),
            manifest: manifest('@acme/checks'),
          },
        }),
      }),
    ).rejects.toBeInstanceOf(InvalidPluginConfigError)
    expect(init).not.toHaveBeenCalled()
  })

  it('given schema defaults, when registered, then init receives the parsed config', async () => {
    const init = vi.fn(async () => {})
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/checks' }] }
    await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/checks': {
          plugin: plugin('@acme/checks', { init }),
          manifest: manifest('@acme/checks', {
            configSchema: {
              type: 'object',
              properties: { mode: { type: 'string', default: 'fast' } },
            },
          }),
        },
      }),
    })
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ pluginConfig: { mode: 'fast' } }))
  })

  it('given a handler, when registered, then activate receives only the selected contributions', async () => {
    const activate = vi.fn(async () => {})
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/checks', contributions: ['lint'] }],
    }
    await registerPlugins(builder(), config, {
      handlers: [
        {
          kind: 'checks',
          blockSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
          activate,
        },
      ],
      loader: loaderFor({
        '@acme/checks': {
          plugin: plugin('@acme/checks'),
          manifest: manifest('@acme/checks', {
            contributes: { checks: { lint: { rule: 'a' }, scan: {} } },
          }),
        },
      }),
    })
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        contributions: new Map([['lint', { rule: 'a' }]]),
      }),
    )
  })

  it('given a duplicate declaration, when registered, then throws and does not load', async () => {
    const load = vi.fn()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/checks' }, { name: '@acme/checks' }],
    }
    await expect(registerPlugins(builder(), config, { loader: { load } })).rejects.toBeInstanceOf(
      PluginValidationError,
    )
    expect(load).not.toHaveBeenCalled()
  })

  it('given a loader that rejects with a plain Error, when registered, then a typed error names the plugin and keeps the cause', async () => {
    const kernel = builder()
    const cause = new Error('missing')
    const failure = await registerPlugins(
      kernel,
      { ...makeMockConfig(), plugins: [{ name: '@acme/missing' }] },
      {
        loader: {
          load: async () => {
            throw cause
          },
        },
      },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ pluginName: '@acme/missing', fields: ['load'], cause })
    expect((failure as Error).message).toContain('@acme/missing')
    expect(kernel.disposers.size).toBe(0)
  })

  it('given a loader that rejects with a SpecdError, when registered, then it propagates unchanged', async () => {
    const specd = new PluginNotFoundError('@acme/missing')
    await expect(
      registerPlugins(
        builder(),
        { ...makeMockConfig(), plugins: [{ name: '@acme/missing' }] },
        {
          loader: {
            load: async () => {
              throw specd
            },
          },
        },
      ),
    ).rejects.toBe(specd)
  })

  it('given destroy failures, when disposed, then they are aggregated and a second dispose is a no-op', async () => {
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    const registration = await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/first': {
          plugin: plugin('@acme/first', {
            destroy: async () => {
              throw new Error('first')
            },
          }),
          manifest: manifest('@acme/first'),
        },
        '@acme/second': {
          plugin: plugin('@acme/second', {
            destroy: async () => {
              throw new Error('second')
            },
          }),
          manifest: manifest('@acme/second'),
        },
      }),
    })
    const failure = await registration.dispose().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginDestroyError)
    expect(failure).toBeInstanceOf(SpecdError)
    expect((failure as PluginDestroyError).code).toBe('PLUGIN_DESTROY_FAILED')
    expect((failure as PluginDestroyError).errors.map((e) => (e as Error).message)).toEqual([
      'second',
      'first',
    ])
    await expect(registration.dispose()).resolves.toBeUndefined()
  })

  it('given an agents-only plugin, when registered, then init still runs', async () => {
    const init = vi.fn(async () => {})
    await registerPlugins(
      builder(),
      { ...makeMockConfig(), plugins: [{ name: '@acme/agent' }] },
      {
        loader: loaderFor({
          '@acme/agent': {
            plugin: plugin('@acme/agent', { init }),
            manifest: manifest('@acme/agent'),
          },
        }),
      },
    )
    expect(init).toHaveBeenCalledOnce()
  })

  it('given a later plugin with invalid config, when registered, then no plugin is initialized', async () => {
    const init = vi.fn(async () => {})
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/one' }, { name: '@acme/two', config: { extra: true } }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/one': { plugin: plugin('@acme/one', { init }), manifest: manifest('@acme/one') },
          '@acme/two': { plugin: plugin('@acme/two', { init }), manifest: manifest('@acme/two') },
        }),
      }),
    ).rejects.toBeInstanceOf(InvalidPluginConfigError)
    expect(init).not.toHaveBeenCalled()
  })

  it('given destroy throws during rollback, when init fails, then the init error still propagates', async () => {
    const destroyed: string[] = []
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/first': {
            plugin: plugin('@acme/first', {
              destroy: async () => {
                destroyed.push('first')
                throw new Error('destroy failed')
              },
            }),
            manifest: manifest('@acme/first'),
          },
          '@acme/second': {
            plugin: plugin('@acme/second', {
              init: async () => {
                throw new Error('init failed')
              },
              destroy: async () => {
                destroyed.push('second')
              },
            }),
            manifest: manifest('@acme/second'),
          },
        }),
      }),
    ).rejects.toMatchObject({
      name: 'PluginInitError',
      pluginName: '@acme/second',
      message: expect.stringContaining('init failed'),
      rollbackErrors: [expect.any(Error)],
    })
    expect(destroyed).toEqual(['first'])
  })

  it('given one destroy throws, when disposed, then every destroy is still attempted', async () => {
    const destroyed: string[] = []
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    const registration = await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/first': {
          plugin: plugin('@acme/first', {
            destroy: async () => {
              destroyed.push('first')
            },
          }),
          manifest: manifest('@acme/first'),
        },
        '@acme/second': {
          plugin: plugin('@acme/second', {
            destroy: async () => {
              destroyed.push('second')
              throw new Error('second')
            },
          }),
          manifest: manifest('@acme/second'),
        },
      }),
    })
    await expect(registration.dispose()).rejects.toBeInstanceOf(PluginDestroyError)
    expect(destroyed).toEqual(['second', 'first'])
  })

  it('given two handlers for one kind, when registered, then throws DuplicateHandlerKindError', async () => {
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/checks' }] }
    await expect(
      registerPlugins(builder(), config, {
        handlers: [
          { kind: 'agents', blockSchema: { safeParse: () => ({ success: true }) } as never },
        ],
        loader: loaderFor({}),
      }),
    ).rejects.toBeInstanceOf(DuplicateHandlerKindError)
  })

  it('given duplicate handlers and no declared plugins, when registered, then throws DuplicateHandlerKindError', async () => {
    await expect(
      registerPlugins(builder(), makeMockConfig(), {
        handlers: [
          { kind: 'agents', blockSchema: { safeParse: () => ({ success: true }) } as never },
        ],
        loader: { load: vi.fn() },
      }),
    ).rejects.toBeInstanceOf(DuplicateHandlerKindError)
  })

  it('given a schema violation, when registered, then throws InvalidPluginConfigError before init', async () => {
    const init = vi.fn(async () => {})
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/checks', config: { mode: 1 } }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/checks': {
            plugin: plugin('@acme/checks', { init }),
            manifest: manifest('@acme/checks', {
              configSchema: { type: 'object', properties: { mode: { type: 'string' } } },
            }),
          },
        }),
      }),
    ).rejects.toBeInstanceOf(InvalidPluginConfigError)
    expect(init).not.toHaveBeenCalled()
  })

  it('given init throws SpecdError, when registered, then that error propagates and the previous plugin is destroyed', async () => {
    const specd = new UnknownContributionError('@acme/second', 'missing')
    const destroyed: string[] = []
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    await expect(
      registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/first': {
            plugin: plugin('@acme/first', {
              destroy: async () => {
                destroyed.push('first')
              },
            }),
            manifest: manifest('@acme/first'),
          },
          '@acme/second': {
            plugin: plugin('@acme/second', {
              init: async () => {
                throw specd
              },
            }),
            manifest: manifest('@acme/second'),
          },
        }),
      }),
    ).rejects.toBe(specd)
    expect(destroyed).toEqual(['first'])
  })

  it('given activate throws, when registered, then PluginInitError names the plugin and destroy runs in reverse', async () => {
    const destroyed: string[] = []
    const cause = new Error('activate failed')
    const kernel = builder()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
    }
    await expect(
      registerPlugins(kernel, config, {
        handlers: [
          {
            kind: 'checks',
            blockSchema: { safeParse: () => ({ success: true }) } as never,
            activate: async (context: { pluginName: string }) => {
              if (context.pluginName === '@acme/second') throw cause
            },
          },
        ],
        loader: loaderFor({
          '@acme/first': {
            plugin: plugin('@acme/first', {
              destroy: async () => {
                destroyed.push('first')
              },
            }),
            manifest: manifest('@acme/first', { contributes: { checks: { lint: {} } } }),
          },
          '@acme/second': {
            plugin: plugin('@acme/second', {
              destroy: async () => {
                destroyed.push('second')
              },
            }),
            manifest: manifest('@acme/second', { contributes: { checks: { lint: {} } } }),
          },
        }),
      }),
    ).rejects.toMatchObject({ name: 'PluginInitError', pluginName: '@acme/second', cause })
    expect(destroyed).toEqual(['second', 'first'])
    expect(kernel.disposers.size).toBe(0)
  })

  it('given init receives its arguments, when registered, then it gets config and pluginConfig', async () => {
    const init = vi.fn(async () => {})
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/checks' }] }
    await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/checks': {
          plugin: plugin('@acme/checks', { init }),
          manifest: manifest('@acme/checks'),
        },
      }),
    })
    expect(init).toHaveBeenCalledWith({ config, pluginConfig: {} })
  })

  it('given plugins a, b, c where c init fails, when registered, then b then a are destroyed and c is not', async () => {
    const calls: string[] = []
    const make = (name: string, failInit = false): SpecdPlugin =>
      plugin(`@acme/${name}`, {
        init: async () => {
          calls.push(`init:${name}`)
          if (failInit) throw new Error('c failed')
        },
        destroy: async () => {
          calls.push(`destroy:${name}`)
        },
      })
    const kernel = builder()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/a' }, { name: '@acme/b' }, { name: '@acme/c' }],
    }
    await expect(
      registerPlugins(kernel, config, {
        loader: loaderFor({
          '@acme/a': { plugin: make('a'), manifest: manifest('@acme/a') },
          '@acme/b': { plugin: make('b'), manifest: manifest('@acme/b') },
          '@acme/c': { plugin: make('c', true), manifest: manifest('@acme/c') },
        }),
      }),
    ).rejects.toMatchObject({ pluginName: '@acme/c' })
    expect(calls).toEqual(['init:a', 'init:b', 'init:c', 'destroy:b', 'destroy:a'])
    expect(kernel.disposers.size).toBe(0)
  })

  it('given several initialized plugins whose destroy fails during rollback, when a later init fails, then the init error propagates with every rollback error attached', async () => {
    const attempted: string[] = []
    const failing = (name: string): SpecdPlugin =>
      plugin(`@acme/${name}`, {
        destroy: async () => {
          attempted.push(name)
          throw new Error(`destroy ${name}`)
        },
      })
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/a' }, { name: '@acme/b' }, { name: '@acme/c' }],
    }
    const failure = await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/a': { plugin: failing('a'), manifest: manifest('@acme/a') },
        '@acme/b': { plugin: failing('b'), manifest: manifest('@acme/b') },
        '@acme/c': {
          plugin: plugin('@acme/c', {
            init: async () => {
              throw new Error('init c')
            },
          }),
          manifest: manifest('@acme/c'),
        },
      }),
    }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ name: 'PluginInitError', pluginName: '@acme/c' })
    expect(
      (failure as { rollbackErrors: Error[] }).rollbackErrors.map((error) => error.message),
    ).toEqual(['destroy b', 'destroy a'])
    expect(attempted).toEqual(['b', 'a'])
  })

  it('given three plugins, when registered and disposed, then init runs in order, one named disposer is registered and destroy runs in reverse', async () => {
    const order: string[] = []
    const make = (name: string): SpecdPlugin =>
      plugin(name, {
        init: async () => {
          order.push(`init:${name}`)
        },
        destroy: async () => {
          order.push(`destroy:${name}`)
        },
      })
    const kernel = builder()
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/a' }, { name: '@acme/b' }, { name: '@acme/c' }],
    }
    const registration = await registerPlugins(kernel, config, {
      loader: loaderFor({
        '@acme/a': { plugin: make('@acme/a'), manifest: manifest('@acme/a') },
        '@acme/b': { plugin: make('@acme/b'), manifest: manifest('@acme/b') },
        '@acme/c': { plugin: make('@acme/c'), manifest: manifest('@acme/c') },
      }),
    })
    expect(kernel.disposers.size).toBe(1)
    expect([...kernel.disposers.keys()]).toEqual(['specd-plugins'])
    await registration.dispose()
    expect(order).toEqual([
      'init:@acme/a',
      'init:@acme/b',
      'init:@acme/c',
      'destroy:@acme/c',
      'destroy:@acme/b',
      'destroy:@acme/a',
    ])
  })

  it('given a frozen SpecdError from init and a failing rollback destroy, when registered, then the frozen error propagates and the rollback failure is logged at warn', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    try {
      const frozen: UnknownContributionError = Object.freeze(
        new UnknownContributionError('@acme/second', 'missing'),
      )
      const config = {
        ...makeMockConfig(),
        plugins: [{ name: '@acme/first' }, { name: '@acme/second' }],
      }
      const failure = await registerPlugins(builder(), config, {
        loader: loaderFor({
          '@acme/first': {
            plugin: plugin('@acme/first', {
              destroy: async () => {
                throw new Error('destroy first')
              },
            }),
            manifest: manifest('@acme/first'),
          },
          '@acme/second': {
            plugin: plugin('@acme/second', {
              init: async () => {
                throw frozen
              },
            }),
            manifest: manifest('@acme/second'),
          },
        }),
      }).catch((error: unknown) => error)
      expect(failure).toBe(frozen)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(warn.mock.calls[0])).toContain('destroy first')
    } finally {
      warn.mockRestore()
    }
  })

  it.each([
    ['undefined', undefined],
    ['an object without manifest', { plugin: plugin('@acme/a') }],
    ['an object without plugin', { manifest: manifest('@acme/a') }],
    ['a string', 'nope'],
  ])(
    'given a loader resolving to %s, when registered, then PluginValidationError(load) is thrown',
    async (_label, value) => {
      const failure = await registerPlugins(
        builder(),
        { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] },
        { loader: { load: async () => value as never } },
      ).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: '@acme/a', fields: ['load'] })
    },
  )

  it('given a loader result whose plugin getter throws, when registered, then PluginValidationError(load) keeps the cause', async () => {
    const cause = new Error('getter')
    const result = {
      get plugin(): never {
        throw cause
      },
      manifest: manifest('@acme/a'),
    }
    const failure = await registerPlugins(
      builder(),
      { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] },
      { loader: { load: async () => result as never } },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ fields: ['load'], cause })
  })

  it('given a loader that throws undefined, when registered, then the cause is still recorded', async () => {
    const failure = await registerPlugins(
      builder(),
      { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] },
      {
        loader: {
          load: async () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw undefined
          },
        },
      },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect('cause' in (failure as object)).toBe(true)
  })

  it('given an init that throws undefined, when registered, then PluginInitError records the cause', async () => {
    const failure = await registerPlugins(
      builder(),
      { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] },
      {
        loader: loaderFor({
          '@acme/a': {
            plugin: plugin('@acme/a', {
              init: async () => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw undefined
              },
            }),
            manifest: manifest('@acme/a'),
          },
        }),
      },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginInitError)
    expect('cause' in (failure as object)).toBe(true)
  })

  it('given destroy failures in a, c and a passing b, when disposed, then PluginDestroyError.pluginNames follows destroy order', async () => {
    const failing = (name: string): SpecdPlugin =>
      plugin(`@acme/${name}`, {
        destroy: async () => {
          throw new Error(`destroy ${name}`)
        },
      })
    const config = {
      ...makeMockConfig(),
      plugins: [{ name: '@acme/a' }, { name: '@acme/b' }, { name: '@acme/c' }],
    }
    const registration = await registerPlugins(builder(), config, {
      loader: loaderFor({
        '@acme/a': { plugin: failing('a'), manifest: manifest('@acme/a') },
        '@acme/b': { plugin: plugin('@acme/b'), manifest: manifest('@acme/b') },
        '@acme/c': { plugin: failing('c'), manifest: manifest('@acme/c') },
      }),
    })
    const failure = await registration.dispose().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginDestroyError)
    expect((failure as PluginDestroyError).pluginNames).toEqual(['@acme/c', '@acme/a'])
    expect((failure as PluginDestroyError).errors).toHaveLength(2)
    expect((failure as Error).message).toContain('@acme/c')
    expect((failure as Error).message).toContain('@acme/a')
  })

  it('given two plugins and no kernel ever built, when the handle is disposed twice, then destroy runs once in reverse order', async () => {
    const order: string[] = []
    const make = (name: string): SpecdPlugin =>
      plugin(`@acme/${name}`, {
        destroy: async () => {
          order.push(name)
        },
      })
    const kernel = builder()
    const registration = await registerPlugins(
      kernel,
      { ...makeMockConfig(), plugins: [{ name: '@acme/a' }, { name: '@acme/b' }] },
      {
        loader: loaderFor({
          '@acme/a': { plugin: make('a'), manifest: manifest('@acme/a') },
          '@acme/b': { plugin: make('b'), manifest: manifest('@acme/b') },
        }),
      },
    )
    await registration.dispose()
    await registration.dispose()
    expect(order).toEqual(['b', 'a'])
    expect(kernel.disposers.size).toBe(1)
  })

  it('given a handler whose activate throws a SpecdError, when registered, then it propagates unchanged and plugins are rolled back', async () => {
    const specd = new UnknownContributionError('@acme/a', 'missing')
    const destroyed: string[] = []
    const failure = await registerPlugins(
      builder(),
      { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] },
      {
        handlers: [
          {
            kind: 'widgets',
            blockSchema: z.record(z.unknown()),
            activate: async () => {
              throw specd
            },
          },
        ],
        loader: loaderFor({
          '@acme/a': {
            plugin: plugin('@acme/a', {
              destroy: async () => {
                destroyed.push('a')
              },
            }),
            manifest: manifest('@acme/a', { contributes: { widgets: { w: {} } } }),
          },
        }),
      },
    ).catch((error: unknown) => error)
    expect(failure).toBe(specd)
    expect(destroyed).toEqual(['a'])
  })

  it('given the default loader and an unresolvable package, when registered, then PluginNotFoundError fails startup before any init', async () => {
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/does-not-exist-anywhere' }] }
    const failure = await registerPlugins(builder(), config, {
      loader: createPluginLoader({ config }),
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginNotFoundError)
    expect(failure).toMatchObject({ pluginName: '@acme/does-not-exist-anywhere' })
  })
})
