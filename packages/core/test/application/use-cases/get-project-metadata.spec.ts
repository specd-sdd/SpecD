import { describe, expect, it } from 'vitest'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { GetProjectMetadata } from '../../../src/application/use-cases/get-project-metadata.js'

/**
 * Creates a minimal valid config for GetProjectMetadata tests.
 *
 * @returns A {@link SpecdConfig} fixture
 */
function makeConfig(): SpecdConfig {
  return {
    projectRoot: '/tmp/project',
    configPath: '/tmp/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: '/tmp/project/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/tmp/project/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/tmp/project',
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: '/tmp/project/.specd/changes',
      changesAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/changes' } },
      draftsPath: '/tmp/project/.specd/drafts',
      draftsAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/drafts' } },
      discardedPath: '/tmp/project/.specd/discarded',
      discardedAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/discarded' } },
      archivePath: '/tmp/project/.specd/archive',
      archiveAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/archive' } },
    },
    approvals: { spec: false, signoff: false },
  }
}

/**
 * Creates a typed file reader mock.
 *
 * @param content - Content to return from reads
 * @returns A typed {@link FileReader} mock
 */
function makeFileReader(content: string | null): FileReader {
  return {
    read: async () => content,
  }
}

describe('GetProjectMetadata', () => {
  it('given a missing metadata file, when execute runs, then it returns null metadata', async () => {
    const useCase = new GetProjectMetadata(makeConfig(), makeFileReader(null))

    await expect(useCase.execute()).resolves.toEqual({ metadata: null })
  })

  it('given valid metadata content, when execute runs, then it returns the parsed metadata', async () => {
    const metadata = {
      version: 1,
      optimized: { context: 'Optimized project summary' },
      freshness: {
        algorithm: 'sha256',
        inputs: {
          config: { path: '/tmp/project/specd.yaml', hash: 'abc123' },
          contextFiles: [{ path: '/tmp/project/README.md', hash: 'def456' }],
          specMetadata: [{ id: 'core:composition-resolver', hash: 'ghi789' }],
        },
        combinedHash: 'xyz000',
      },
      generated: { at: '2026-07-04T00:00:00.000Z' },
    }
    const useCase = new GetProjectMetadata(makeConfig(), makeFileReader(JSON.stringify(metadata)))

    await expect(useCase.execute()).resolves.toEqual({ metadata })
  })

  it('given invalid metadata content, when execute runs, then it returns null metadata', async () => {
    const useCase = new GetProjectMetadata(makeConfig(), makeFileReader('{invalid-json'))

    await expect(useCase.execute()).resolves.toEqual({ metadata: null })
  })
})
