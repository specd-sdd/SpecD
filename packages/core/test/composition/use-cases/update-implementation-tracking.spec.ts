import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { UpdateImplementationTracking } from '../../../src/application/use-cases/update-implementation-tracking.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import {
  createUpdateImplementationTracking,
  type UpdateImplementationTrackingDeps,
} from '../../../src/composition/use-cases/update-implementation-tracking.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-update-implementation-tracking-'))
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

describe('createUpdateImplementationTracking', () => {
  it('returns a wired UpdateImplementationTracking instance from SpecdConfig', async () => {
    const config = await makeConfig()
    const useCase = createUpdateImplementationTracking(config)

    expect(useCase).toBeInstanceOf(UpdateImplementationTracking)
    await expect(
      useCase.execute({
        name: 'missing',
        action: 'add',
        file: 'src/foo.ts',
        specId: 'core:change',
      }),
    ).rejects.toThrow(ChangeNotFoundError)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: UpdateImplementationTrackingDeps = {
      changes: {} as never,
      files: {} as never,
      projectRoot: '/tmp/project',
    }

    expect(createUpdateImplementationTracking(deps)).toBeInstanceOf(UpdateImplementationTracking)
  })

  it('rejects deps plus composition options', () => {
    const deps: UpdateImplementationTrackingDeps = {
      changes: {} as never,
      files: {} as never,
      projectRoot: '/tmp/project',
    }

    expect(() =>
      createUpdateImplementationTracking(deps as unknown as SpecdConfig, {
        extraNodeModulesPaths: [],
      }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})
