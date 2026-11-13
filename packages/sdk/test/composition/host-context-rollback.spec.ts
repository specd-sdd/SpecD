import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginDestroyError } from '@specd/plugin-manager'
import type { SpecdConfig } from '@specd/core'

// Only the kernel builder is faked (so the build can fail); the plugin manager is real.
const build = vi.fn()
const registerDisposer = vi.fn()
vi.mock('@specd/core/extensions', () => ({
  createKernelBuilder: vi.fn(() => ({ build, registerDisposer })),
}))

// Real plugin-manager (including the real PluginDestroyError); registerPlugins delegates
// to the real implementation unless a test overrides one call.
vi.mock('@specd/plugin-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/plugin-manager')>()
  return { ...actual, registerPlugins: vi.fn(actual.registerPlugins) }
})

const { createSdkContext } = await import('../../src/composition/host-context.js')
const { registerPlugins } = await import('@specd/plugin-manager')
const registerPluginsMock = vi.mocked(registerPlugins)

let projectRoot: string | undefined

afterEach(async () => {
  vi.clearAllMocks()
  if (projectRoot !== undefined) {
    await rm(projectRoot, { recursive: true, force: true })
    projectRoot = undefined
  }
})

async function writeThrowingPlugin(root: string, name: string): Promise<void> {
  const packageRoot = path.join(root, 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }),
  )
  await writeFile(
    path.join(packageRoot, 'specd-plugin.json'),
    JSON.stringify({ schemaVersion: 2, name, version: '1.0.0', contributes: {} }),
  )
  await writeFile(
    path.join(packageRoot, 'index.js'),
    `export function create() {
      return {
        name: ${JSON.stringify(name)},
        version: '1.0.0',
        async init() {},
        async destroy() { throw new Error('destroy ${name}') },
      }
    }`,
  )
}

describe('createSdkContext rollback with the real plugin manager', () => {
  it('unpacks a real PluginDestroyError into rollbackErrors', async () => {
    const first = new Error('destroy a')
    const second = new Error('destroy b')
    const destroyError = new PluginDestroyError([first, second], ['@local/a', '@local/b'])
    // The real class carries `errors` as own property and `code` on the prototype.
    expect(destroyError.code).toBe('PLUGIN_DESTROY_FAILED')
    registerPluginsMock.mockResolvedValueOnce({
      dispose: async () => {
        throw destroyError
      },
    } as never)
    const buildError = new Error('build failed')
    build.mockRejectedValueOnce(buildError)

    const thrown: unknown = await createSdkContext({} as SpecdConfig).catch((e: unknown) => e)

    expect(thrown).toBe(buildError)
    expect((buildError as Error & { rollbackErrors?: unknown }).rollbackErrors).toEqual([
      first,
      second,
    ])
  })

  it('keeps the build error when real plugins fail to destroy during rollback', async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'specd-sdk-rollback-'))
    await writeThrowingPlugin(projectRoot, '@local/a')
    await writeThrowingPlugin(projectRoot, '@local/b')
    const config = {
      projectRoot,
      configPath: path.join(projectRoot, 'specd.yaml'),
      plugins: [{ name: '@local/a' }, { name: '@local/b' }],
    } as unknown as SpecdConfig
    const buildError = new Error('build failed')
    build.mockRejectedValueOnce(buildError)

    const thrown: unknown = await createSdkContext(config).catch((e: unknown) => e)

    expect(thrown).toBe(buildError)
    const rollback = (buildError as Error & { rollbackErrors?: Error[] }).rollbackErrors
    expect(rollback?.map((e) => e.message)).toEqual(['destroy @local/b', 'destroy @local/a'])
  })
})
