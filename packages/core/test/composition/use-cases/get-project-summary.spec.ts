import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GetProjectSummary } from '../../../src/application/use-cases/get-project-summary.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import {
  createGetProjectSummary,
  resolveGetProjectSummaryDeps,
  type GetProjectSummaryDeps,
} from '../../../src/composition/use-cases/get-project-summary.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

/**
 * Creates a minimal fs-backed config for getProjectSummary factory tests.
 *
 * @returns A resolved {@link SpecdConfig}
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-get-project-summary-'))
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

describe('createGetProjectSummary', () => {
  it('returns a wired GetProjectSummary instance from SpecdConfig', async () => {
    const config = await makeConfig()
    const useCase = createGetProjectSummary(config)

    expect(useCase).toBeInstanceOf(GetProjectSummary)

    const summary = await useCase.execute()
    expect(summary).toEqual({
      activeCount: 0,
      draftCount: 0,
      discardedCount: 0,
      archivedCount: 0,
      specsByWorkspace: { default: 0 },
      workspaceCount: 1,
    })
  })

  it('downstream repositories are bootstrapped using canonical wiring', async () => {
    const config = await makeConfig()
    const useCase = createGetProjectSummary(config)
    expect(useCase).toBeDefined()
    const summary = await useCase.execute()
    expect(summary.workspaceCount).toBe(1)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const changes = {
      count: async () => 0,
      countDrafts: async () => 0,
      countDiscarded: async () => 0,
    } as never
    const archive = { count: async () => 0 } as never
    const listWorkspaces = { execute: async () => [] } as never
    const deps: GetProjectSummaryDeps = {
      changes,
      archive,
      listWorkspaces,
    }

    expect(createGetProjectSummary(deps)).toBeInstanceOf(GetProjectSummary)
  })

  it('rejects deps plus composition options', () => {
    const changes = {
      count: async () => 0,
      countDrafts: async () => 0,
      countDiscarded: async () => 0,
    } as never
    const archive = { count: async () => 0 } as never
    const listWorkspaces = { execute: async () => [] } as never
    const deps: GetProjectSummaryDeps = {
      changes,
      archive,
      listWorkspaces,
    }

    expect(() =>
      createGetProjectSummary(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('resolveGetProjectSummaryDeps returns only count-capable deps', async () => {
    const config = await makeConfig()
    const resolver = createCompositionResolver(config)
    const deps = resolveGetProjectSummaryDeps(resolver)

    expect(Object.keys(deps).sort()).toEqual(['archive', 'changes', 'listWorkspaces'])
  })
})
