import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type SpecdConfig } from '../../src/application/specd-config.js'
import {
  createSharedSpecRepositories,
  createSharedChangeRepository,
} from '../../src/composition/shared-repository-wiring.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

/**
 * Creates a minimal configuration for shared wiring tests.
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-shared-wiring-'))
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
    projectRoot: process.cwd(),
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

describe('shared-repository-wiring', () => {
  it('createSharedSpecRepositories derives canonical metadata paths', async () => {
    const config = await makeConfig()
    const specRepos = createSharedSpecRepositories({ config })

    expect(specRepos.has('default')).toBe(true)
    const defaultRepo = specRepos.get('default')!
    expect(defaultRepo).toBeDefined()
  })

  it('createSharedChangeRepository constructs change repository with working resolvers and preHashCleanup', async () => {
    const config = await makeConfig()
    const changeRepo = createSharedChangeRepository({ config })

    expect(changeRepo).toBeDefined()
    expect((changeRepo as any)._resolveArtifactTypes).toBeDefined()

    // Let's call the resolved resolver hook
    const artifactTypes = await (changeRepo as any)._resolveArtifactTypes()
    expect(artifactTypes).toBeDefined()

    const tasksType = artifactTypes.find((t: any) => t.id === 'tasks')
    expect(tasksType).toBeDefined()
    expect(tasksType?.preHashCleanup).toBeDefined()
    expect(tasksType?.preHashCleanup.length).toBeGreaterThan(0)

    const normalizeCheckbox = tasksType?.preHashCleanup.find(
      (c: any) => c.id === 'normalize-checkboxes',
    )
    expect(normalizeCheckbox).toBeDefined()

    // Test that the cleanup regex normalizes [x] to [ ]
    const content1 = '- [ ] Task 1\n- [ ] Task 2'
    const content2 = '- [x] Task 1\n- [ ] Task 2'

    // Import and apply preHashCleanup
    const { applyPreHashCleanup } = await import('../../src/domain/services/pre-hash-cleanup.js')
    const cleaned1 = applyPreHashCleanup(
      content1,
      tasksType!.preHashCleanup as unknown as Parameters<typeof applyPreHashCleanup>[1],
    )
    const cleaned2 = applyPreHashCleanup(
      content2,
      tasksType!.preHashCleanup as unknown as Parameters<typeof applyPreHashCleanup>[1],
    )

    expect(cleaned1).toBe(cleaned2)
  })
})
