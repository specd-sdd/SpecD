import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginLoaderOptions } from '@specd/plugin-manager'

const PACKAGE_NAME = '@specd/plugin-agent-opencode'
const OPTIONS = { config: {} } as unknown as PluginLoaderOptions

/**
 * Loads the plugin entry point with `specd-plugin.json` reads replaced.
 *
 * @param own - Content served for the manifest next to the entry point, or `undefined` for ENOENT.
 * @param parent - Content served for the manifest in the parent directory, or `undefined` for ENOENT.
 * @returns The freshly imported entry module.
 */
async function loadWithManifests(
  own: string | undefined,
  parent: string | undefined,
): Promise<typeof import('../src/index.js')> {
  vi.resetModules()
  vi.doMock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const readFileMock = (async (file: unknown, ...rest: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('specd-plugin.json')) {
        const served = file.endsWith(path.join('src', 'specd-plugin.json')) ? own : parent
        if (served === undefined) {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
        return served
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(file, ...rest)
    }) as typeof actual.readFile
    return { ...actual, readFile: readFileMock }
  })
  return import('../src/index.js')
}

afterEach(() => {
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
})

describe('plugin-agent-opencode create()', () => {
  it('given the package manifest, when create runs, then name and version come from it and the plugin has no type', async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specd-plugin.json'),
        'utf8',
      ),
    ) as { name: string; version: string }
    const { create } = await import('../src/index.js')

    const plugin = await create(OPTIONS)

    expect(plugin.name).toBe(manifest.name)
    expect(plugin.name).toBe(PACKAGE_NAME)
    expect(plugin.version).toBe(manifest.version)
    expect(plugin).not.toHaveProperty('type')
  })

  it('given a manifest next to the entry point, when create runs, then it wins over the parent directory', async () => {
    const { create } = await loadWithManifests(
      JSON.stringify({ name: 'own-name', version: '1.1.1' }),
      JSON.stringify({ name: 'parent-name', version: '2.2.2' }),
    )

    const plugin = await create(OPTIONS)

    expect(plugin.name).toBe('own-name')
    expect(plugin.version).toBe('1.1.1')
  })

  it('given no manifest next to the entry point, when create runs, then it falls back to the parent directory', async () => {
    const { create } = await loadWithManifests(
      undefined,
      JSON.stringify({ name: 'parent-name', version: '2.2.2' }),
    )

    const plugin = await create(OPTIONS)

    expect(plugin.name).toBe('parent-name')
    expect(plugin.version).toBe('2.2.2')
  })

  it('given an unreadable manifest next to the entry point, when the parent one is valid, then the parent is used', async () => {
    const { create } = await loadWithManifests(
      '{ not json',
      JSON.stringify({ name: 'parent-name', version: '2.2.2' }),
    )

    const plugin = await create(OPTIONS)

    expect(plugin.name).toBe('parent-name')
  })

  it('given no manifest anywhere, when create runs, then it rejects with a PluginValidationError', async () => {
    const { create } = await loadWithManifests(undefined, undefined)

    const error = await create(OPTIONS).catch((e: unknown) => e)

    expect(error).toMatchObject({
      code: 'PLUGIN_VALIDATION_ERROR',
      pluginName: PACKAGE_NAME,
      fields: ['specd-plugin.json'],
    })
  })

  it.each([
    ['a missing name', { version: '1.0.0' }, ['specd-plugin.json: name']],
    ['an empty name', { name: '', version: '1.0.0' }, ['specd-plugin.json: name']],
    ['a non-string name', { name: 7, version: '1.0.0' }, ['specd-plugin.json: name']],
    ['a missing version', { name: 'x' }, ['specd-plugin.json: version']],
    ['an empty version', { name: 'x', version: '' }, ['specd-plugin.json: version']],
    ['a non-string version', { name: 'x', version: 1 }, ['specd-plugin.json: version']],
    ['neither field', {}, ['specd-plugin.json: name', 'specd-plugin.json: version']],
  ])(
    'given a manifest with %s, when create runs, then it rejects with a PluginValidationError naming the fields',
    async (_label, manifest, fields) => {
      const { create } = await loadWithManifests(JSON.stringify(manifest), undefined)

      const error = await create(OPTIONS).catch((e: unknown) => e)

      expect(error).toMatchObject({
        code: 'PLUGIN_VALIDATION_ERROR',
        pluginName: PACKAGE_NAME,
        fields: fields,
      })
    },
  )
})
