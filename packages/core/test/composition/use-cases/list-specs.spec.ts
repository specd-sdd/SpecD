import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ListSpecs } from '../../../src/application/use-cases/list-specs.js'
import {
  createListSpecs,
  resolveListSpecsDeps,
} from '../../../src/composition/use-cases/list-specs.js'
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
 * Creates a minimal fs-backed config for listSpecs factory tests.
 *
 * @returns A resolved {@link SpecdConfig}
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-list-specs-'))
  const specsPath = path.join(tmpDir, 'specs')
  await fs.mkdir(specsPath, { recursive: true })

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
      changesPath: path.join(tmpDir, '.specd', 'changes'),
      changesAdapter: {
        adapter: 'fs',
        config: { path: path.join(tmpDir, '.specd', 'changes') },
      },
      draftsPath: path.join(tmpDir, '.specd', 'drafts'),
      draftsAdapter: {
        adapter: 'fs',
        config: { path: path.join(tmpDir, '.specd', 'drafts') },
      },
      discardedPath: path.join(tmpDir, '.specd', 'discarded'),
      discardedAdapter: {
        adapter: 'fs',
        config: { path: path.join(tmpDir, '.specd', 'discarded') },
      },
      archivePath: path.join(tmpDir, '.specd', 'archive'),
      archiveAdapter: {
        adapter: 'fs',
        config: { path: path.join(tmpDir, '.specd', 'archive') },
      },
    },
    approvals: { spec: false, signoff: false },
  }
}

describe('createListSpecs', () => {
  it('returns a wired ListSpecs instance from SpecdConfig', async () => {
    const config = await makeConfig()
    const useCase = createListSpecs(config)

    expect(useCase).toBeInstanceOf(ListSpecs)
  })

  it('resolveListSpecsDeps returns only listWorkspaces', async () => {
    const config = await makeConfig()
    const resolver = createCompositionResolver(config)
    const deps = resolveListSpecsDeps(resolver)

    expect(Object.keys(deps)).toEqual(['listWorkspaces'])
  })
})
