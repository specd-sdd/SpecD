import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { GetImplementationReview } from '../../../src/application/use-cases/get-implementation-review.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import {
  createGetImplementationReview,
  type GetImplementationReviewDeps,
} from '../../../src/composition/use-cases/get-implementation-review.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-get-implementation-review-'))
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

describe('createGetImplementationReview', () => {
  it('returns a wired GetImplementationReview instance from SpecdConfig', async () => {
    const config = await makeConfig()
    const useCase = createGetImplementationReview(config)

    expect(useCase).toBeInstanceOf(GetImplementationReview)
    await expect(useCase.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: GetImplementationReviewDeps = {
      changes: {} as never,
    }

    expect(createGetImplementationReview(deps)).toBeInstanceOf(GetImplementationReview)
  })

  it('rejects deps plus composition options', () => {
    const deps: GetImplementationReviewDeps = {
      changes: {} as never,
    }

    expect(() =>
      createGetImplementationReview(deps as unknown as SpecdConfig, {
        extraNodeModulesPaths: [],
      }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})
