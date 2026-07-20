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
    index: vi.fn().mockResolvedValue(INDEX_RESULT),
  } as unknown as CodeGraphHostPort
}

const baseInput = {
  projectRoot: '/project',
  vcsRoot: null,
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

    expect(provider.index).toHaveBeenCalledOnce()
    expect(provider.index).toHaveBeenCalledWith(expect.not.objectContaining({ force: true }))
    expect(result).toBe(INDEX_RESULT)
  })

  it('forwards force=true to provider.index', async () => {
    const provider = makeProvider()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: true,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
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

  it('forwards a non-null vcsRoot to provider.index', async () => {
    const provider = makeProvider()
    const vcsRoot = '/repo'

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      vcsRoot,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ vcsRoot }))
  })

  it('forwards null vcsRoot to provider.index', async () => {
    const provider = makeProvider()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      vcsRoot: null,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ vcsRoot: null }))
  })
})
