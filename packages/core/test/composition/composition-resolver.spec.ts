import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type SpecdConfig } from '../../src/application/specd-config.js'
import { createCompositionResolver } from '../../src/composition/composition-resolver.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-composition-resolver-'))
  const specsPath = path.join(tmpDir, 'specs')
  const changesPath = path.join(tmpDir, '.specd', 'changes')
  const draftsPath = path.join(tmpDir, '.specd', 'drafts')
  const discardedPath = path.join(tmpDir, '.specd', 'discarded')
  const archivePath = path.join(tmpDir, '.specd', 'archive')
  await Promise.all([
    fs.mkdir(specsPath, { recursive: true }),
    fs.mkdir(changesPath, { recursive: true }),
    fs.mkdir(draftsPath, { recursive: true }),
    fs.mkdir(discardedPath, { recursive: true }),
    fs.mkdir(archivePath, { recursive: true }),
  ])

  return {
    projectRoot: tmpDir,
    configPath: path.join(tmpDir, 'specd.yaml'),
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath,
        specsAdapter: { adapter: 'fs', config: { path: specsPath } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: tmpDir,
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
  }
}

describe('createCompositionResolver', () => {
  it('caches shared dependencies within one composition session', async () => {
    const config = await makeConfig()
    const resolver = createCompositionResolver(config)

    expect(resolver.getChangeRepository()).toBe(resolver.getChangeRepository())
    expect(resolver.getArchiveRepository()).toBe(resolver.getArchiveRepository())
    expect(resolver.getSpecRepositories()).toBe(resolver.getSpecRepositories())
    expect(resolver.getSchemaProvider()).toBe(resolver.getSchemaProvider())
    expect(resolver.getListWorkspaces()).toBe(resolver.getListWorkspaces())
    expect(resolver.getRunStepHooks()).toBe(resolver.getRunStepHooks())
    expect(resolver.getRefreshImplementationTracking()).toBe(
      resolver.getRefreshImplementationTracking(),
    )
  })

  it('keeps cache scope isolated per resolver instance', async () => {
    const config = await makeConfig()

    const a = createCompositionResolver(config)
    const b = createCompositionResolver(config)

    expect(a.getChangeRepository()).not.toBe(b.getChangeRepository())
    expect(a.getSchemaProvider()).not.toBe(b.getSchemaProvider())
  })

  it('prefers explicit specsAdapter metadataPath over VCS derivation', async () => {
    const config = await makeConfig()
    if (tmpDir === undefined) throw new Error('tmpDir missing')
    const customMeta = path.join(tmpDir, 'custom-meta')
    await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })
    const workspace = config.workspaces[0]
    if (workspace === undefined) throw new Error('workspace missing')
    const withExplicit: SpecdConfig = {
      ...config,
      workspaces: [
        {
          ...workspace,
          specsAdapter: {
            adapter: 'fs',
            config: { path: workspace.specsPath, metadataPath: customMeta },
          },
        },
      ],
    }

    createCompositionResolver(withExplicit).getSpecRepositories()

    await expect(fs.stat(customMeta)).resolves.toBeDefined()
    const derived = path.join(tmpDir, '.specd', 'metadata')
    await expect(fs.stat(derived)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('derives metadataPath under VCS root when absent from adapter config', async () => {
    const config = await makeConfig()
    if (tmpDir === undefined) throw new Error('tmpDir missing')
    await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })

    createCompositionResolver(config).getSpecRepositories()

    const derived = path.join(tmpDir, '.specd', 'metadata')
    await expect(fs.stat(derived)).resolves.toBeDefined()
  })
})
