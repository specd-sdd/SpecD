import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecdError } from '@specd/core'
import { z } from 'zod'
import {
  DuplicateHandlerKindError,
  PluginValidationError,
  UnknownContributionError,
  createPluginLoader,
  type ContributionKindHandler,
} from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'specd-plugin-loader-contract-'))
  roots.push(root)
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'tmp-project', private: true, type: 'module' }),
    'utf8',
  )
  return root
}

async function pkg(
  root: string,
  name: string,
  body: string,
  manifest?: Record<string, unknown> | string,
): Promise<void> {
  const dir = path.join(root, 'node_modules', ...name.split('/'))
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.0.1', type: 'module', main: './index.js' }),
    'utf8',
  )
  await writeFile(path.join(dir, 'index.js'), body, 'utf8')
  if (manifest !== undefined) {
    await writeFile(
      path.join(dir, 'specd-plugin.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
      'utf8',
    )
  }
}

function manifestFor(name: string, contributes: Record<string, unknown> = {}) {
  return { schemaVersion: 2, name, version: '1.0.0', minCoreVersion: '*', contributes }
}

const pluginBody = (name: string, extra = '') => `{
  name: '${name}', version: '1.0.0',
  async init() {}, async destroy() {}, ${extra}
}`

describe('createPluginLoader contract', () => {
  it('given an async factory, when loaded, then the awaited plugin is returned', async () => {
    const root = await project()
    const name = '@local/async-factory'
    await pkg(
      root,
      name,
      `export async function create() { return ${pluginBody(name)} }`,
      manifestFor(name),
    )
    const loaded = await createPluginLoader({ config: makeMockConfig(root) }).load(name)
    expect(loaded.plugin.name).toBe(name)
  })

  it('given a factory, when loaded, then it receives only config', async () => {
    const root = await project()
    const name = '@local/factory-args'
    await pkg(
      root,
      name,
      `export function create(options) { return { ...${pluginBody(name)}, received: Object.keys(options), receivedConfig: options.config } }`,
      manifestFor(name),
    )
    const config = makeMockConfig(root)
    const loaded = await createPluginLoader({
      config,
      handlers: [{ kind: 'widgets', blockSchema: z.record(z.unknown()) }],
    }).load(name)
    const seen = loaded.plugin as unknown as { received: string[]; receivedConfig: unknown }
    expect(seen.received).toEqual(['config'])
    expect(seen.receivedConfig).toBe(config)
  })

  it('given two handlers for widgets, when the loader is created, then DuplicateHandlerKindError is raised', () => {
    const widgets: ContributionKindHandler = { kind: 'widgets', blockSchema: z.record(z.unknown()) }
    expect(() =>
      createPluginLoader({ config: makeMockConfig(), handlers: [widgets, widgets] }),
    ).toThrow(DuplicateHandlerKindError)
  })

  it('given a custom handler, when loaded, then validatePlugin receives the plugin and its name', async () => {
    const root = await project()
    const name = '@local/widgets'
    await pkg(
      root,
      name,
      `export function create() { return ${pluginBody(name)} }`,
      manifestFor(name, { widgets: { a: {} } }),
    )
    const validatePlugin = vi.fn()
    const handler: ContributionKindHandler = {
      kind: 'widgets',
      blockSchema: z.record(z.unknown()),
      validatePlugin,
    }
    const loaded = await createPluginLoader({
      config: makeMockConfig(root),
      handlers: [handler],
    }).load(name)
    expect(validatePlugin).toHaveBeenCalledWith(loaded.plugin, name)
  })

  it('given install, uninstall, init and destroy hooks, when loaded, then none is called', async () => {
    const root = await project()
    const name = '@local/no-lifecycle'
    await pkg(
      root,
      name,
      `export const calls = []
export function create() {
  return {
    name: '${name}', version: '1.0.0',
    async init() { calls.push('init') }, async destroy() { calls.push('destroy') },
    async install() { calls.push('install'); return { installed: [], skipped: [] } },
    async uninstall() { calls.push('uninstall') },
    calls,
  }
}`,
      manifestFor(name),
    )
    const loaded = await createPluginLoader({ config: makeMockConfig(root) }).load(name)
    expect((loaded.plugin as unknown as { calls: string[] }).calls).toEqual([])
  })

  it('given a package whose import throws, when loaded, then PluginValidationError(entry) keeps the cause', async () => {
    const root = await project()
    const name = '@local/import-fails'
    await pkg(root, name, "throw new Error('import boom')", manifestFor(name))
    const failure = await createPluginLoader({ config: makeMockConfig(root) })
      .load(name)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SpecdError)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ pluginName: name, fields: ['entry'] })
    expect((failure as PluginValidationError).cause).toMatchObject({ message: 'import boom' })
  })

  it('given a factory that throws a plain error, when loaded, then PluginValidationError(create) keeps the cause', async () => {
    const root = await project()
    const name = '@local/create-fails'
    await pkg(
      root,
      name,
      "export function create() { throw new Error('create boom') }",
      manifestFor(name),
    )
    const failure = await createPluginLoader({ config: makeMockConfig(root) })
      .load(name)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ pluginName: name, fields: ['create'] })
    expect((failure as PluginValidationError).cause).toMatchObject({ message: 'create boom' })
  })

  it('given a factory that rejects with a SpecdError, when loaded, then it propagates unchanged', async () => {
    const root = await project()
    const name = '@local/create-specd'
    const specd = new UnknownContributionError(name, 'nope')
    ;(globalThis as Record<string, unknown>)['__specdLoaderTestError'] = specd
    await pkg(
      root,
      name,
      'export async function create() { throw globalThis.__specdLoaderTestError }',
      manifestFor(name),
    )
    const failure = await createPluginLoader({ config: makeMockConfig(root) })
      .load(name)
      .catch((error: unknown) => error)
    expect(failure).toBe(specd)
    expect(failure).toBeInstanceOf(SpecdError)
  })

  it('given a missing manifest file, when loaded, then the read error is the cause', async () => {
    const root = await project()
    const name = '@local/no-manifest'
    await pkg(root, name, `export function create() { return ${pluginBody(name)} }`)
    const failure = await createPluginLoader({ config: makeMockConfig(root) })
      .load(name)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ fields: ['specd-plugin.json'] })
    expect((failure as PluginValidationError).cause).toMatchObject({ code: 'ENOENT' })
  })

  it('given a manifest that is not JSON, when loaded, then the parse error is the cause', async () => {
    const root = await project()
    const name = '@local/bad-json'
    await pkg(root, name, `export function create() { return ${pluginBody(name)} }`, '{ not json')
    const failure = await createPluginLoader({ config: makeMockConfig(root) })
      .load(name)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ fields: ['specd-plugin.json'] })
    expect((failure as PluginValidationError).cause).toBeInstanceOf(SyntaxError)
  })

  it('given a factory that reads name and version from specd-plugin.json, when loaded, then the plugin matches the manifest', async () => {
    const root = await project()
    const name = '@local/from-manifest'
    await pkg(
      root,
      name,
      `import { readFileSync } from 'node:fs'
      const manifest = JSON.parse(readFileSync(new URL('./specd-plugin.json', import.meta.url), 'utf8'))
      export function create() {
        return { name: manifest.name, version: manifest.version, async init() {}, async destroy() {} }
      }`,
      { ...manifestFor(name), version: '2.3.4' },
    )
    const loaded = await createPluginLoader({ config: makeMockConfig(root) }).load(name)
    expect(loaded.plugin.name).toBe(loaded.manifest.name)
    expect(loaded.plugin.version).toBe('2.3.4')
    expect(loaded.plugin.version).toBe(loaded.manifest.version)
  })
})
