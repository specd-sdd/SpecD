import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { type SpecRepository } from '@specd/core'
import { IndexProjectGraph } from '../../../src/application/use-cases/index-project-graph.js'
import { createCodeGraphProvider } from '../../../src/composition/create-code-graph-provider.js'

const makeMockRepo = (): SpecRepository =>
  ({
    get specsPath() {
      return undefined
    },
    list: async () => [],
    count: async () => 0,
    specHash: async () => null,
    metadata: async () => null,
    readPersistedDependsOn: async () => [],
    readPersistedImplementation: async () => [],
    artifact: async () => null,
  }) as unknown as SpecRepository

describe('IndexProjectGraph integration', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('indexes after force recreate without leaving the store closed', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-project-graph-force-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })

    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()

    const graphConfig = {
      projectRoot: tempDir,
      workspaces: new Map(),
      excludePaths: [],
      includePaths: [],
      concurrency: 4,
    }

    const result = await new IndexProjectGraph().execute({
      provider,
      projectRoot: tempDir,
      workspaces: [
        {
          name: 'default',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig,
      codeGraphVersion: '1.0.0',
      force: true,
    })

    expect(result.filesIndexed).toBe(0)
    await expect(provider.getStatistics()).resolves.toEqual(
      expect.objectContaining({ fileCount: 0 }),
    )

    await provider.close()
  })
})
