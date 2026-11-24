import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SpecdError } from '@specd/core'
import { z } from 'zod'
import {
  DuplicateContributionError,
  DuplicateHandlerKindError,
  InvalidPluginConfigError,
  PluginNotFoundError,
  PluginValidationError,
  UnknownContributionKindError,
  UnsupportedSchemaKeywordError,
  createPluginLoader,
} from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

async function createTempProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'specd-plugin-loader-'))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'tmp-project', private: true, type: 'module' }, null, 2),
    'utf8',
  )
  return root
}

async function createLocalPackage(
  projectRoot: string,
  name: string,
  body: string,
  manifest?: Record<string, unknown>,
): Promise<void> {
  const packageRoot = path.join(projectRoot, 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })

  await writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '0.0.1', type: 'module', main: './index.js' }, null, 2),
    'utf8',
  )
  await writeFile(path.join(packageRoot, 'index.js'), body, 'utf8')
  if (manifest !== undefined) {
    await writeFile(
      path.join(packageRoot, 'specd-plugin.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    )
  }
}

/** Asserts a PluginValidationError that did not come from importing the package. */
async function expectRejectedBeforeImport(
  load: Promise<unknown>,
  expectedFields?: readonly string[],
): Promise<void> {
  const failure = await load.catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(PluginValidationError)
  const error = failure as PluginValidationError
  expect(error.fields).not.toContain('entry')
  expect(error.cause).toBeUndefined()
  expect(error.message).not.toContain('IMPORTED')
  if (expectedFields !== undefined) expect(error.fields).toEqual(expectedFields)
}

describe('createPluginLoader', () => {
  it('given missing package, when load is called, then throws PluginNotFoundError', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      const loader = createPluginLoader({ config })
      await expect(loader.load('@specd/plugin-agent-missing')).rejects.toBeInstanceOf(
        PluginNotFoundError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given manifest without version, when load is called, then throws PluginValidationError', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      await createLocalPackage(
        projectRoot,
        '@local/missing-version-plugin',
        "export function create() { return { name: '@local/missing-version-plugin' } }",
        { schemaVersion: 1, name: '@local/missing-version-plugin', pluginType: 'agent' },
      )

      const loader = createPluginLoader({ config })
      await expect(loader.load('@local/missing-version-plugin')).rejects.toBeInstanceOf(
        PluginValidationError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given manifest with version, when load is called, then loads successfully', async () => {
    const projectRoot = await createTempProjectRoot()
    const config = makeMockConfig(projectRoot)
    try {
      await createLocalPackage(
        projectRoot,
        '@local/valid-version-plugin',
        `export function create() {
          return {
            name: '@local/valid-version-plugin',
            type: 'agent',
            version: '1.0.0',
            async init() {},
            async destroy() {},
            async install() { return { installed: [], skipped: [] } },
            async uninstall() {}
          }
        }`,
        {
          schemaVersion: 2,
          name: '@local/valid-version-plugin',
          version: '1.0.0',
          minCoreVersion: '*',
          contributes: {},
        },
      )

      const loader = createPluginLoader({ config })
      const loaded = await loader.load('@local/valid-version-plugin')

      expect(loaded.plugin.name).toBe('@local/valid-version-plugin')
      expect(loaded.manifest.schemaVersion).toBe(2)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an invalid manifest, when load is called, then the package is not imported', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/invalid-manifest',
        "throw new Error('IMPORTED')",
        { schemaVersion: 1, name: '@local/invalid-manifest', pluginType: 'agent' },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expectRejectedBeforeImport(loader.load('@local/invalid-manifest'))
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an unscoped name, when load is called, then throws before import', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, 'my-plugin', "throw new Error('IMPORTED')", {
        schemaVersion: 2,
        name: 'my-plugin',
        version: '1.0.0',
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expectRejectedBeforeImport(loader.load('my-plugin'), ['name'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a duplicate contribution id, when load is called, then throws', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/duplicate',
        'export function create() { return {} }',
        {
          schemaVersion: 2,
          name: '@local/duplicate',
          version: '1.0.0',
          contributes: { agents: { lint: {} }, checks: { lint: {} } },
        },
      )
      const loader = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [{ kind: 'checks', blockSchema: z.record(z.string(), z.object({}).strict()) }],
      })
      const failure = await loader.load('@local/duplicate').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(DuplicateContributionError)
      expect(failure).toMatchObject({ pluginName: '@local/duplicate' })
      expect((failure as Error).message).toContain('@local/duplicate')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  const loadFailureCases: Array<{
    name: string
    manifest: Record<string, unknown>
    error: new (...args: never[]) => Error
  }> = [
    {
      name: '@local/unknown-kind',
      manifest: {
        schemaVersion: 2,
        name: '@local/unknown-kind',
        version: '1.0.0',
        contributes: { checks: { lint: {} } },
      },
      error: UnknownContributionKindError,
    },
    {
      name: '@local/bad-block',
      manifest: {
        schemaVersion: 2,
        name: '@local/bad-block',
        version: '1.0.0',
        contributes: { agents: { claude: { extra: true } } },
      },
      error: PluginValidationError,
    },
    {
      name: '@local/bad-keyword',
      manifest: {
        schemaVersion: 2,
        name: '@local/bad-keyword',
        version: '1.0.0',
        contributes: {},
        configSchema: { type: 'object', $ref: '#/x' },
      },
      error: UnsupportedSchemaKeywordError,
    },
    {
      name: '@local/bad-default',
      manifest: {
        schemaVersion: 2,
        name: '@local/bad-default',
        version: '1.0.0',
        contributes: {},
        configSchema: {
          type: 'object',
          properties: { mode: { type: 'string' } },
          required: ['mode'],
          additionalProperties: false,
        },
        defaultConfig: {},
      },
      error: InvalidPluginConfigError,
    },
  ]

  it.each(loadFailureCases)(
    'given $name, when load is called, then throws the matching error',
    async (entry) => {
      const projectRoot = await createTempProjectRoot()
      try {
        await createLocalPackage(
          projectRoot,
          entry.name,
          'export function create() { return {} }',
          entry.manifest,
        )
        const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
        const failure = await loader.load(entry.name).catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(entry.error)
        expect((failure as Error).message).toContain(entry.name)
        if (entry.error === UnknownContributionKindError) {
          expect(failure).toMatchObject({ pluginName: entry.name, kind: 'checks' })
          expect((failure as Error).message).toContain('checks')
        }
        if (entry.error === PluginValidationError) {
          expect(failure).toMatchObject({ pluginName: entry.name })
          expect((failure as PluginValidationError).fields.join(',')).toContain(
            'contributes.agents',
          )
        }
      } finally {
        await rm(projectRoot, { recursive: true, force: true })
      }
    },
  )

  it('given a runtime version that mismatches the manifest, when load is called, then throws', async () => {
    const projectRoot = await createTempProjectRoot()
    const runtime = `export function create() {
      return { name: '@local/runtime', version: '9.9.9', async init() { throw new Error('init') }, async destroy() {} }
    }`
    try {
      await createLocalPackage(projectRoot, '@local/runtime', runtime, {
        schemaVersion: 2,
        name: '@local/runtime',
        version: '1.0.0',
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/runtime')).rejects.toBeInstanceOf(PluginValidationError)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a missing contribution accessor, when load is called, then throws', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/needs-contribution',
        `export function create() {
          return { name: '@local/needs-contribution', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        {
          schemaVersion: 2,
          name: '@local/needs-contribution',
          version: '1.0.0',
          contributes: { checks: { lint: {} } },
        },
      )
      const activating = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [
          {
            kind: 'checks',
            blockSchema: z.record(z.string(), z.object({}).strict()),
            activate: async () => {},
          },
        ],
      })
      await expect(activating.load('@local/needs-contribution')).rejects.toBeInstanceOf(
        PluginValidationError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a valid plugin whose init throws, when load is called, then init is not called', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/no-lifecycle',
        `export function create() {
          return {
            name: '@local/no-lifecycle',
            version: '1.0.0',
            async init() { throw new Error('init') },
            async destroy() { throw new Error('destroy') },
            async install() { throw new Error('install') },
            async uninstall() { throw new Error('uninstall') }
          }
        }`,
        {
          schemaVersion: 2,
          name: '@local/no-lifecycle',
          version: '1.0.0',
          contributes: { agents: { main: {} } },
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const loaded = await loader.load('@local/no-lifecycle')
      expect(loaded.plugin.name).toBe('@local/no-lifecycle')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a non-object contributes, when load is called, then validation names the plugin', async () => {
    const projectRoot = await createTempProjectRoot()
    const runtime = `export function create() {
      return { name: '@local/shape', version: '1.0.0', async init() {}, async destroy() {} }
    }`
    try {
      await createLocalPackage(projectRoot, '@local/shape', runtime, {
        schemaVersion: 2,
        name: '@local/shape',
        version: '1.0.0',
        contributes: [],
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/shape')).rejects.toMatchObject({
        pluginName: '@local/shape',
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given an invalid contribution id, when load is called, then validation names the plugin', async () => {
    const projectRoot = await createTempProjectRoot()
    const runtime = `export function create() {
      return { name: '@local/bad-id', version: '1.0.0', async init() {}, async destroy() {} }
    }`
    try {
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await createLocalPackage(projectRoot, '@local/bad-id', runtime, {
        schemaVersion: 2,
        name: '@local/bad-id',
        version: '1.0.0',
        contributes: { agents: { 'Bad.Id': {} } },
      })
      await expect(loader.load('@local/bad-id')).rejects.toBeInstanceOf(PluginValidationError)
      await expect(loader.load('@local/bad-id')).rejects.toMatchObject({
        pluginName: '@local/bad-id',
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a default-exported create, when load is called, then the plugin is returned', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/default-create',
        `export default { create() {
          return { name: '@local/default-create', version: '1.0.0', async init() {}, async destroy() {} }
        } }`,
        {
          schemaVersion: 2,
          name: '@local/default-create',
          version: '1.0.0',
          contributes: {},
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const loaded = await loader.load('@local/default-create')
      expect(loaded.plugin.name).toBe('@local/default-create')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given export default create, when load is called, then the function is the factory', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/default-fn',
        `export default function create() {
          return { name: '@local/default-fn', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        {
          schemaVersion: 2,
          name: '@local/default-fn',
          version: '1.0.0',
          contributes: {},
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const loaded = await loader.load('@local/default-fn')
      expect(loaded.plugin.name).toBe('@local/default-fn')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a runtime value missing only destroy, when load is called, then the fields list only destroy', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/missing-destroy',
        `export function create() {
          return { name: '@local/missing-destroy', version: '1.0.0', async init() {} }
        }`,
        {
          schemaVersion: 2,
          name: '@local/missing-destroy',
          version: '1.0.0',
          contributes: {},
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/missing-destroy')).rejects.toMatchObject({
        fields: ['destroy'],
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a runtime value that breaks the base contract, when load is called, then it throws', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/not-a-plugin',
        `export function create() { return { name: 'not-scoped', version: '1.0.0' } }`,
        {
          schemaVersion: 2,
          name: '@local/not-a-plugin',
          version: '1.0.0',
          contributes: {},
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/not-a-plugin')).rejects.toBeInstanceOf(PluginValidationError)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given pluginType on a version-2 manifest, when load is called, then it throws', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, '@local/typed', 'throw new Error("IMPORTED")', {
        schemaVersion: 2,
        name: '@local/typed',
        version: '1.0.0',
        pluginType: 'agent',
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expectRejectedBeforeImport(loader.load('@local/typed'), ['pluginType'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a host agents handler, when the loader is created, then it throws DuplicateHandlerKindError', () => {
    expect(() =>
      createPluginLoader({
        config: makeMockConfig(),
        handlers: [
          { kind: 'agents', blockSchema: { safeParse: () => ({ success: true }) } as never },
        ],
      }),
    ).toThrow(DuplicateHandlerKindError)
  })

  it('given agents without install, when load is called, then validatePlugin names install and uninstall', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/agents',
        `export function create() {
          return { name: '@local/agents', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        {
          schemaVersion: 2,
          name: '@local/agents',
          version: '1.0.0',
          contributes: { agents: { main: {} } },
        },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/agents')).rejects.toMatchObject({
        fields: ['install', 'uninstall'],
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a manifest name that differs from the requested package, when load is called, then validation names the requested plugin', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/requested',
        `export function create() {
          return { name: '@local/requested', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name: '@local/other', version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/requested')).rejects.toMatchObject({
        pluginName: '@local/requested',
        fields: ['name'],
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a runtime name that differs from the manifest, when load is called, then fields are only name', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/rename',
        `export function create() {
          return { name: '@local/other', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name: '@local/rename', version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/rename')).rejects.toMatchObject({ fields: ['name'] })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a runtime version that differs from the manifest, when load is called, then fields are only version', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/reversion',
        `export async function create() {
          return { name: '@local/reversion', version: '9.9.9', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name: '@local/reversion', version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/reversion')).rejects.toMatchObject({ fields: ['version'] })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given schemaVersion 1 alone, when load is called, then fields name schemaVersion and the package is not imported', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, '@local/v1', "throw new Error('IMPORTED')", {
        schemaVersion: 1,
        name: '@local/v1',
        version: '1.0.0',
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expectRejectedBeforeImport(loader.load('@local/v1'), ['schemaVersion'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given contributes.checks as an array, when load is called, then it throws before import', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, '@local/array-kind', "throw new Error('IMPORTED')", {
        schemaVersion: 2,
        name: '@local/array-kind',
        version: '1.0.0',
        contributes: { checks: [] },
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expectRejectedBeforeImport(loader.load('@local/array-kind'), ['contributes.checks'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given several unknown manifest keys, when load is called, then fields name each key', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, '@local/extra-keys', "throw new Error('IMPORTED')", {
        schemaVersion: 2,
        name: '@local/extra-keys',
        version: '1.0.0',
        pluginType: 'agent',
        other: 1,
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load('@local/extra-keys').catch((error: unknown) => error)
      expect((failure as PluginValidationError).fields).toEqual(
        expect.arrayContaining(['pluginType', 'other']),
      )
      expect((failure as PluginValidationError).fields).not.toContain('manifest')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a package with no create export, when load is called, then fields are create', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(projectRoot, '@local/no-create', 'export const other = 1', {
        schemaVersion: 2,
        name: '@local/no-create',
        version: '1.0.0',
        contributes: {},
      })
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      await expect(loader.load('@local/no-create')).rejects.toMatchObject({
        name: 'PluginValidationError',
        pluginName: '@local/no-create',
        fields: ['create'],
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a custom handler whose validatePlugin throws a PluginValidationError, when load is called, then that error propagates', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/widget-reject'
      await createLocalPackage(
        projectRoot,
        name,
        `export function create() {
          return { name: '${name}', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name, version: '1.0.0', contributes: { widgets: { a: {} } } },
      )
      const thrown = new PluginValidationError(name, ['widgetHook'])
      const loader = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [
          {
            kind: 'widgets',
            blockSchema: z.record(z.string(), z.object({}).strict()),
            validatePlugin: () => {
              throw thrown
            },
          },
        ],
      })
      await expect(loader.load(name)).rejects.toBe(thrown)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a custom handler whose validatePlugin throws a plain Error, when load is called, then it is wrapped with the cause', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/widget-plain'
      await createLocalPackage(
        projectRoot,
        name,
        `export function create() {
          return { name: '${name}', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name, version: '1.0.0', contributes: { widgets: { a: {} } } },
      )
      const cause = new Error('hook exploded')
      const loader = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [
          {
            kind: 'widgets',
            blockSchema: z.record(z.string(), z.object({}).strict()),
            validatePlugin: () => {
              throw cause
            },
          },
        ],
      })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: name, fields: ['contributes.widgets'], cause })
      expect((failure as Error).message).toContain('hook exploded')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a handler block schema that throws a plain Error, when load is called, then it is wrapped with the cause', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/widget-schema'
      await createLocalPackage(projectRoot, name, 'export function create() { return {} }', {
        schemaVersion: 2,
        name,
        version: '1.0.0',
        contributes: { widgets: { a: {} } },
      })
      const cause = new Error('refine exploded')
      const loader = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [
          {
            kind: 'widgets',
            blockSchema: z.record(z.string(), z.unknown()).superRefine(() => {
              throw cause
            }),
          },
        ],
      })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: name, fields: ['contributes.widgets'], cause })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a plugin whose property getter throws, when load is called, then it is wrapped with the cause', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/getter'
      await createLocalPackage(
        projectRoot,
        name,
        `export function create() {
          return { get name() { throw new Error('getter exploded') }, version: '1.0.0', async init() {}, async destroy() {} }
        }`,
        { schemaVersion: 2, name, version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: name })
      expect((failure as PluginValidationError).fields).toEqual(['plugin'])
      expect((failure as PluginValidationError).cause).toMatchObject({ message: 'getter exploded' })
      expect((failure as PluginValidationError).cause).toBeInstanceOf(Error)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a default export whose create getter throws, when load is called, then it is a PluginValidationError with the cause', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/create-getter'
      await createLocalPackage(
        projectRoot,
        name,
        "export default { get create() { throw new Error('create getter') } }",
        { schemaVersion: 2, name, version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(SpecdError)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect((failure as PluginValidationError).fields).toEqual(['create'])
      expect((failure as PluginValidationError).cause).toMatchObject({ message: 'create getter' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a plugin whose name getter throws on the second read, when load is called, then it is a PluginValidationError', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/stateful'
      await createLocalPackage(
        projectRoot,
        name,
        `export function create() {
          let reads = 0
          return {
            get name() { reads += 1; if (reads > 2) throw new Error('stateful getter'); return '${name}' },
            version: '1.0.0', async init() {}, async destroy() {},
          }
        }`,
        { schemaVersion: 2, name, version: '1.0.0', contributes: {} },
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(SpecdError)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect((failure as PluginValidationError).cause).toMatchObject({ message: 'stateful getter' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a handler block schema that transforms to null, when load is called, then it is a PluginValidationError', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/null-schema'
      await createLocalPackage(projectRoot, name, 'export function create() { return {} }', {
        schemaVersion: 2,
        name,
        version: '1.0.0',
        contributes: { widgets: { a: {} } },
      })
      const loader = createPluginLoader({
        config: makeMockConfig(projectRoot),
        handlers: [{ kind: 'widgets', blockSchema: z.unknown().transform(() => null) }],
      })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect((failure as PluginValidationError).fields).toEqual(['contributes.widgets'])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a very deeply nested configSchema, when load is called, then it is an UnsupportedSchemaKeywordError and not a stack overflow', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/deep'
      await createLocalPackage(projectRoot, name, 'export function create() { return {} }', {})
      const depth = 50_000
      const schemaJson = `${'{"type":"object","properties":{"c":'.repeat(depth)}{"type":"string"}${'}}'.repeat(depth)}`
      await writeFile(
        path.join(projectRoot, 'node_modules', '@local', 'deep', 'specd-plugin.json'),
        `{"schemaVersion":2,"name":"${name}","version":"1.0.0","contributes":{},"configSchema":${schemaJson}}`,
        'utf8',
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(UnsupportedSchemaKeywordError)
      expect(failure).toMatchObject({ keyword: 'properties' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given a config whose projectRoot is not a string, when load is called, then fields are projectRoot', async () => {
    const config = { ...makeMockConfig(), projectRoot: undefined as unknown as string }
    const loader = createPluginLoader({ config })
    const failure = await loader.load('@local/any').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SpecdError)
    expect(failure).toMatchObject({
      name: 'PluginValidationError',
      pluginName: '@local/any',
      fields: ['projectRoot'],
    })
  })

  it.each(['', 'proj', './proj', 'a/b'])(
    'given the non-absolute projectRoot %j, when load is called, then fields are projectRoot with no raw TypeError',
    async (projectRoot) => {
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load('@local/any').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: '@local/any', fields: ['projectRoot'] })
    },
  )

  it('given a manifest with an own __proto__ key under contributes, when load is called, then it is an unknown kind', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const name = '@local/proto-kind'
      await createLocalPackage(projectRoot, name, 'export function create() { return {} }')
      await writeFile(
        path.join(projectRoot, 'node_modules', '@local', 'proto-kind', 'specd-plugin.json'),
        `{"schemaVersion":2,"name":"${name}","version":"1.0.0","contributes":{"__proto__":{"a":{}}}}`,
        'utf8',
      )
      const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
      const failure = await loader.load(name).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(UnknownContributionKindError)
      expect(failure).toMatchObject({ pluginName: name, kind: '__proto__' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  describe('hostile handler and plugin behaviour', () => {
    const hostile = (value: unknown): unknown =>
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('hostile prototype')
          },
        },
      ) ?? value

    async function loadWith(
      name: string,
      handler: Record<string, unknown>,
      body?: string,
    ): Promise<unknown> {
      const projectRoot = await createTempProjectRoot()
      try {
        await createLocalPackage(
          projectRoot,
          name,
          body ??
            `export function create() {
          return { name: '${name}', version: '1.0.0', async init() {}, async destroy() {} }
        }`,
          { schemaVersion: 2, name, version: '1.0.0', contributes: { widgets: { a: {} } } },
        )
        const loader = createPluginLoader({
          config: makeMockConfig(projectRoot),
          handlers: [{ kind: 'widgets', ...handler } as never],
        })
        return await loader.load(name).catch((error: unknown) => error)
      } finally {
        await rm(projectRoot, { recursive: true, force: true })
      }
    }

    it('given a blockSchema.safeParse that throws a hostile Proxy, when load is called, then it is wrapped with the original cause', async () => {
      const thrown = hostile(undefined)
      const failure = await loadWith('@local/e1-block', {
        blockSchema: {
          safeParse: () => {
            throw thrown
          },
        },
      })
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ fields: ['contributes.widgets'] })
      expect((failure as PluginValidationError).cause).toBe(thrown)
    })

    it.each([
      ['undefined', () => undefined],
      ['a failure without error', () => ({ success: false })],
      ['a failure with non-array issues', () => ({ success: false, error: { issues: 5 } })],
      [
        'data as a Proxy with a throwing ownKeys',
        () => ({
          success: true,
          data: new Proxy(
            {},
            {
              ownKeys() {
                throw new Error('keys')
              },
            },
          ),
        }),
      ],
    ])(
      'given a safeParse returning %s, when load is called, then it is PluginValidationError on contributes.widgets',
      async (_label, safeParse) => {
        const failure = await loadWith('@local/e5-garbage', { blockSchema: { safeParse } })
        expect(failure).toBeInstanceOf(PluginValidationError)
        expect(failure).toMatchObject({
          pluginName: '@local/e5-garbage',
          fields: ['contributes.widgets'],
        })
      },
    )

    it('given an async validatePlugin that rejects, when load is called, then it is wrapped and nothing is unhandled', async () => {
      const unhandled: unknown[] = []
      const listener = (reason: unknown): void => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', listener)
      try {
        const rejection = new Error('async boom')
        const failure = await loadWith('@local/e6-async', {
          blockSchema: z.record(z.string(), z.object({}).strict()),
          validatePlugin: () => Promise.reject(rejection),
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(failure).toBeInstanceOf(PluginValidationError)
        expect(failure).toMatchObject({ fields: ['contributes.widgets'] })
        expect((failure as PluginValidationError).cause).toBe(rejection)
        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', listener)
      }
    })

    it('given a factory that throws a hostile Proxy, when load is called, then it is wrapped on create with the original cause', async () => {
      const projectRoot = await createTempProjectRoot()
      try {
        const name = '@local/e1-create'
        await createLocalPackage(
          projectRoot,
          name,
          `export function create() { throw new Proxy({}, { getPrototypeOf() { throw new Error('x') } }) }`,
          { schemaVersion: 2, name, version: '1.0.0', contributes: {} },
        )
        const loader = createPluginLoader({ config: makeMockConfig(projectRoot) })
        const failure = await loader.load(name).catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(PluginValidationError)
        expect(failure).toMatchObject({ fields: ['create'] })
      } finally {
        await rm(projectRoot, { recursive: true, force: true })
      }
    })
  })
})
