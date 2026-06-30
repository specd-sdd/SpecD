import { describe, expect, it, vi } from 'vitest'
import { IndexProjectGraph } from '../../../src/application/use-cases/index-project-graph.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { type IndexResult } from '../../../src/domain/value-objects/index-result.js'

const INDEX_RESULT: IndexResult = {
  filesDiscovered: 1,
  filesIndexed: 1,
  documentsIndexed: 0,
  filesRemoved: 0,
  filesSkipped: 0,
  specsDiscovered: 0,
  specsIndexed: 0,
  errors: [],
  duration: 10,
  workspaces: [],
  vcsRef: null,
  graphFingerprint: '',
  fullRebuildReason: null,
}

function makeProvider(): CodeGraphHostPort {
  return {
    recreate: vi.fn().mockResolvedValue(undefined),
    index: vi.fn().mockResolvedValue(INDEX_RESULT),
  } as unknown as CodeGraphHostPort
}

const baseInput = {
  projectRoot: '/project',
  workspaces: [],
  graphConfig: {
    projectRoot: '/project',
    workspaces: new Map(),
    excludePaths: [],
    includePaths: [],
    concurrency: 4,
  },
  codeGraphVersion: '1.0.0',
} as const

describe('IndexProjectGraph', () => {
  it('calls index without recreate when force is false', async () => {
    const provider = makeProvider()

    const result = await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: false,
    })

    expect(provider.recreate).not.toHaveBeenCalled()
    expect(provider.index).toHaveBeenCalledOnce()
    expect(result).toBe(INDEX_RESULT)
  })

  it('recreates before index when force is true', async () => {
    const provider = makeProvider()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: true,
    })

    expect(provider.recreate).toHaveBeenCalledBefore(provider.index as ReturnType<typeof vi.fn>)
  })

  it('forwards onProgress to provider.index', async () => {
    const provider = makeProvider()
    const onProgress = vi.fn()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      onProgress,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
  })
})
