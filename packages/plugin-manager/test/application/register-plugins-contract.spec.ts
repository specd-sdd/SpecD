import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createKernelBuilder, type KernelBuilder } from '@specd/core/extensions'
import { z } from 'zod'
import {
  DuplicateHandlerKindError,
  registerPlugins,
  type ContributionKindHandler,
  type PluginLoader,
  type SpecdPlugin,
  type SpecdPluginManifest,
} from '../../src/index.js'
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
  return { name, version: '1.0.0', init: async () => {}, destroy: async () => {}, ...overrides }
}

function loaderFor(
  entries: Record<string, { plugin: SpecdPlugin; manifest: SpecdPluginManifest }>,
): PluginLoader {
  return {
    load: async (name: string) => {
      const found = entries[name]
      if (found === undefined) throw new Error(`missing ${name}`)
      return found
    },
  }
}

const duplicateAgents: ContributionKindHandler = {
  kind: 'agents',
  blockSchema: z.record(z.unknown()),
}

describe('registerPlugins contract', () => {
  it('given a duplicate handler kind and a supplied loader, when called, then it rejects without throwing synchronously', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    let promise: Promise<unknown> | undefined
    expect(() => {
      promise = registerPlugins(builder, makeMockConfig(), {
        handlers: [duplicateAgents],
        loader: loaderFor({}),
      })
    }).not.toThrow()
    await expect(promise).rejects.toBeInstanceOf(DuplicateHandlerKindError)
  })

  it('given a duplicate handler kind and no loader, when called, then it rejects without throwing synchronously', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    let promise: Promise<unknown> | undefined
    expect(() => {
      promise = registerPlugins(builder, makeMockConfig(), { handlers: [duplicateAgents] })
    }).not.toThrow()
    await expect(promise).rejects.toBeInstanceOf(DuplicateHandlerKindError)
  })

  it('given no input at all and no plugins, when called with a real KernelBuilder, then resolves with a no-op dispose', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    const registration = await registerPlugins(builder, makeMockConfig())
    await expect(registration.dispose()).resolves.toBeUndefined()
  })

  it('given plugins and a real KernelBuilder, when registered, then one disposer named specd-plugins is registered and a second dispose is a no-op', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    const registerDisposer = vi.spyOn(builder, 'registerDisposer')
    const destroy = vi.fn(async () => {})
    const registration = await registerPlugins(
      builder,
      { ...makeMockConfig(), plugins: [{ name: '@acme/one' }] },
      {
        loader: loaderFor({
          '@acme/one': {
            plugin: plugin('@acme/one', { destroy }),
            manifest: manifest('@acme/one'),
          },
        }),
      },
    )
    expect(registerDisposer).toHaveBeenCalledTimes(1)
    expect(registerDisposer).toHaveBeenCalledWith('specd-plugins', expect.any(Function))
    await registration.dispose()
    await registration.dispose()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('given an agents-only plugin, when registered, then nothing is registered on the builder for agents', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    const calls: string[] = []
    const watched = new Proxy(builder, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver) as unknown
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          calls.push(String(property))
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      },
    })
    await registerPlugins(
      watched,
      { ...makeMockConfig(), plugins: [{ name: '@acme/agent' }] },
      {
        loader: loaderFor({
          '@acme/agent': { plugin: plugin('@acme/agent'), manifest: manifest('@acme/agent') },
        }),
      },
    )
    expect(calls).toEqual(['registerDisposer'])
  })

  it('given a non-agents kind whose handler has no activate, when registered, then init runs and nothing is activated', async () => {
    const init = vi.fn(async () => {})
    const handler: ContributionKindHandler = {
      kind: 'widgets',
      blockSchema: z.record(z.unknown()),
    }
    const builder = createKernelBuilder(makeMockConfig())
    const registration = await registerPlugins(
      builder,
      { ...makeMockConfig(), plugins: [{ name: '@acme/w' }] },
      {
        handlers: [handler],
        loader: loaderFor({
          '@acme/w': {
            plugin: plugin('@acme/w', { init }),
            manifest: manifest('@acme/w', { contributes: { widgets: { a: {} } } }),
          },
        }),
      },
    )
    expect(init).toHaveBeenCalledOnce()
    await registration.dispose()
  })

  it('given no input, when one plugin is configured, then the standard loader and built-in agents handler initialize it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specd-register-defaults-'))
    try {
      const name = '@local/defaults'
      const dir = path.join(root, 'node_modules', '@local', 'defaults')
      await mkdir(dir, { recursive: true })
      await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'tmp', private: true, type: 'module' }),
      )
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ name, version: '0.0.1', type: 'module', main: './index.js' }),
      )
      await writeFile(
        path.join(dir, 'specd-plugin.json'),
        JSON.stringify({
          schemaVersion: 2,
          name,
          version: '1.0.0',
          contributes: { agents: { main: {} } },
        }),
      )
      await writeFile(
        path.join(dir, 'index.js'),
        `export const events = (globalThis.__specdDefaultsEvents ??= [])
export function create() {
  return {
    name: '${name}', version: '1.0.0',
    async init() { events.push('init') }, async destroy() { events.push('destroy') },
    async install() { return { installed: [], skipped: [] } }, async uninstall() {},
  }
}`,
      )
      const config = { ...makeMockConfig(root), plugins: [{ name }] }
      const builder = createKernelBuilder(config)
      const registration = await registerPlugins(builder, config)
      const events = (globalThis as Record<string, unknown>)['__specdDefaultsEvents'] as string[]
      expect(events).toEqual(['init'])
      await registration.dispose()
      expect(events).toEqual(['init', 'destroy'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('given a real KernelBuilder, when plugins are registered, then init has run before build is ever called', async () => {
    const builder = createKernelBuilder(makeMockConfig())
    const build = vi.spyOn(builder, 'build')
    const init = vi.fn(async () => {})
    await registerPlugins(
      builder,
      { ...makeMockConfig(), plugins: [{ name: '@acme/one' }] },
      {
        loader: loaderFor({
          '@acme/one': { plugin: plugin('@acme/one', { init }), manifest: manifest('@acme/one') },
        }),
      },
    )
    expect(init).toHaveBeenCalledTimes(1)
    expect(build).not.toHaveBeenCalled()
  })
})
