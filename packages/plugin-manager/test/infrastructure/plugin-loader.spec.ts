import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PluginNotFoundError, PluginValidationError } from '../../src/index.js'
import { createPluginLoader } from '../../src/index.js'

/**
 * Creates a temporary project root with a package.json.
 *
 * @returns Temp project root path.
 */
async function createTempProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'specd-plugin-loader-'))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'tmp-project', private: true, type: 'module' }, null, 2),
    'utf8',
  )
  return root
}

/**
 * Creates a minimal local package under `node_modules`.
 *
 * @param projectRoot - Project root path.
 * @param name - Package name.
 * @param body - JS module content.
 * @param manifest - Optional manifest object.
 */
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

describe('createPluginLoader', () => {
  it('given missing package, when load is called, then throws PluginNotFoundError', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      const loader = createPluginLoader({ projectRoot })
      await expect(loader.load('@specd/plugin-agent-missing')).rejects.toBeInstanceOf(
        PluginNotFoundError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given invalid manifest, when load is called, then throws PluginValidationError', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/invalid-manifest-plugin',
        "export function create() { return { name: '@local/invalid-manifest-plugin' } }",
        { schemaVersion: 1, name: '@local/invalid-manifest-plugin' },
      )

      const loader = createPluginLoader({ projectRoot })
      await expect(loader.load('@local/invalid-manifest-plugin')).rejects.toBeInstanceOf(
        PluginValidationError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given invalid runtime contract, when load is called, then throws PluginValidationError', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/invalid-runtime-plugin',
        "export function create() { return { name: '@local/invalid-runtime-plugin', type: 'agent', version: '1.0.0', configSchema: {} } }",
        {
          schemaVersion: 1,
          name: '@local/invalid-runtime-plugin',
          pluginType: 'agent',
          minCoreVersion: '*',
        },
      )

      const loader = createPluginLoader({ projectRoot })
      await expect(loader.load('@local/invalid-runtime-plugin')).rejects.toBeInstanceOf(
        PluginValidationError,
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('given valid plugin package, when load is called, then returns validated plugin', async () => {
    const projectRoot = await createTempProjectRoot()
    try {
      await createLocalPackage(
        projectRoot,
        '@local/valid-agent-plugin',
        `export function create() {
          return {
            name: '@local/valid-agent-plugin',
            type: 'agent',
            version: '1.0.0',
            configSchema: {},
            async init() {},
            async destroy() {},
            async install() { return { installed: [], skipped: [] } },
            async uninstall() {}
          }
        }`,
        {
          schemaVersion: 1,
          name: '@local/valid-agent-plugin',
          pluginType: 'agent',
          minCoreVersion: '*',
        },
      )

      const loader = createPluginLoader({ projectRoot })
      const plugin = await loader.load('@local/valid-agent-plugin')

      expect(plugin.name).toBe('@local/valid-agent-plugin')
      expect(plugin.type).toBe('agent')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
