import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PluginNotFoundError, PluginValidationError } from '../../src/index.js'
import { createPluginLoader } from '../../src/index.js'
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
            configSchema: {},
            async init() {},
            async destroy() {},
            async install() { return { installed: [], skipped: [] } },
            async uninstall() {}
          }
        }`,
        {
          schemaVersion: 1,
          name: '@local/valid-version-plugin',
          version: '1.0.0',
          pluginType: 'agent',
          minCoreVersion: '*',
        },
      )

      const loader = createPluginLoader({ config })
      const plugin = await loader.load('@local/valid-version-plugin')

      expect(plugin.name).toBe('@local/valid-version-plugin')
      expect(plugin.type).toBe('agent')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
