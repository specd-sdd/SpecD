import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginInitError, registerPlugins } from '@specd/plugin-manager'
import type { KernelBuilder } from '@specd/core/extensions'
import type { SpecdConfig } from '@specd/core'
import { createSdkContext } from '../../src/composition/host-context.js'

const orderKey = '__specdHostE2eOrder'

let projectRoot: string | undefined

afterEach(async () => {
  Reflect.deleteProperty(globalThis, orderKey)
  if (projectRoot !== undefined) {
    await rm(projectRoot, { recursive: true, force: true })
    projectRoot = undefined
  }
})

async function makeConfig(plugins: SpecdConfig['plugins']): Promise<SpecdConfig> {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-sdk-host-'))
  const specsPath = path.join(projectRoot, 'specs')
  const changesPath = path.join(projectRoot, '.specd', 'changes')
  const draftsPath = path.join(projectRoot, '.specd', 'drafts')
  const discardedPath = path.join(projectRoot, '.specd', 'discarded')
  const archivePath = path.join(projectRoot, '.specd', 'archive')
  await Promise.all([
    mkdir(specsPath, { recursive: true }),
    mkdir(changesPath, { recursive: true }),
    mkdir(draftsPath, { recursive: true }),
    mkdir(discardedPath, { recursive: true }),
    mkdir(archivePath, { recursive: true }),
  ])
  return {
    projectRoot,
    configPath: path.join(projectRoot, 'specd.yaml'),
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath,
        specsAdapter: { adapter: 'fs', config: { path: specsPath } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: projectRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath,
      changesAdapter: { adapter: 'fs', config: { path: changesPath } },
      draftsPath,
      draftsAdapter: { adapter: 'fs', config: { path: draftsPath } },
      discardedPath,
      discardedAdapter: { adapter: 'fs', config: { path: discardedPath } },
      archivePath,
      archiveAdapter: { adapter: 'fs', config: { path: archivePath } },
    },
    approvals: { spec: false, signoff: false },
    invalidation: { artifacts: 'downstream', workflow: 'preserve' },
    ...(plugins !== undefined ? { plugins } : {}),
  }
}

async function writePlugin(name: string, id: 'a' | 'b', initThrows = false): Promise<void> {
  const packageRoot = path.join(projectRoot ?? '', 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }),
  )
  await writeFile(
    path.join(packageRoot, 'specd-plugin.json'),
    JSON.stringify({
      schemaVersion: 2,
      name,
      version: '1.0.0',
      contributes: {},
    }),
  )
  const throwLine = initThrows ? `throw new Error('init ${id}')` : `order.push('init:${id}')`
  await writeFile(
    path.join(packageRoot, 'index.js'),
    `export function create() {
      const order = (globalThis.${orderKey} ??= [])
      return {
        name: ${JSON.stringify(name)},
        version: '1.0.0',
        async init() { ${throwLine} },
        async destroy() { order.push('destroy:${id}') },
      }
    }`,
  )
}

function order(): string[] {
  return (globalThis as unknown as Record<string, string[] | undefined>)[orderKey] ?? []
}

describe('createSdkContext with the real plugin manager', () => {
  it('initializes plugins before the kernel exists and destroys them in reverse', async () => {
    const config = await makeConfig([{ name: '@local/a' }, { name: '@local/b' }])
    await writePlugin('@local/a', 'a')
    await writePlugin('@local/b', 'b')
    const host = await createSdkContext(config)
    expect(order()).toEqual(['init:a', 'init:b'])
    await host.dispose()
    expect(order()).toEqual(['init:a', 'init:b', 'destroy:b', 'destroy:a'])
  })

  it('does not build a kernel when a plugin fails to initialize', async () => {
    const config = await makeConfig([{ name: '@local/a' }])
    await writePlugin('@local/a', 'a', true)
    await expect(createSdkContext(config)).rejects.toBeInstanceOf(PluginInitError)
    expect(order()).toEqual([])
  })

  it('loads no plugin when plugins is false', async () => {
    const config = await makeConfig([{ name: '@local/a' }])
    await writePlugin('@local/a', 'a')
    const host = await createSdkContext(config, { plugins: false })
    expect(order()).toEqual([])
    await host.dispose()
    expect(order()).toEqual([])
  })

  it('destroys already initialized plugins when a later plugin fails to initialize', async () => {
    const config = await makeConfig([{ name: '@local/a' }, { name: '@local/b' }])
    await writePlugin('@local/a', 'a')
    await writePlugin('@local/b', 'b', true)
    const error: unknown = await createSdkContext(config).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PluginInitError)
    expect((error as PluginInitError).pluginName).toBe('@local/b')
    expect(order()).toEqual(['init:a', 'destroy:a'])
  })

  it.each([
    ['without a plugins key', undefined],
    ['with an empty plugin list', []],
  ] as const)('loads no plugin and registers no disposer %s', async (_label, plugins) => {
    const config = await makeConfig(plugins === undefined ? undefined : [...plugins])
    const host = await createSdkContext(config)
    expect(order()).toEqual([])
    await host.dispose()
    expect(order()).toEqual([])

    const registerDisposer = vi.fn()
    const registration = await registerPlugins(
      { registerDisposer } as unknown as KernelBuilder,
      config,
      {
        handlers: [],
      },
    )
    expect(registerDisposer).not.toHaveBeenCalled()
    await registration.dispose()
  })

  it('runs each plugin destroy exactly once across repeated and concurrent dispose calls', async () => {
    const config = await makeConfig([{ name: '@local/a' }, { name: '@local/b' }])
    await writePlugin('@local/a', 'a')
    await writePlugin('@local/b', 'b')
    const host = await createSdkContext(config)
    const first = host.dispose()
    const second = host.dispose()
    await Promise.all([first, second])
    await host.dispose()
    await host[Symbol.asyncDispose]()
    expect(order()).toEqual(['init:a', 'init:b', 'destroy:b', 'destroy:a'])
  })
})
