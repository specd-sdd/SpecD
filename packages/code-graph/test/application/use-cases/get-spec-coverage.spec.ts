import { describe, expect, it, vi } from 'vitest'
import { GetSpecCoverage } from '../../../src/application/use-cases/get-spec-coverage.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

function makeProvider(options: {
  specFound?: boolean
  files?: ReturnType<typeof createRelation>[]
  symbols?: ReturnType<typeof createRelation>[]
}): CodeGraphHostPort {
  const { specFound = true, files = [], symbols = [] } = options
  return {
    getSpec: vi.fn().mockResolvedValue(specFound ? { specId: 'core:foo' } : undefined),
    getCoveredFiles: vi.fn().mockResolvedValue(files),
    getCoveredSymbols: vi.fn().mockResolvedValue(symbols),
  } as unknown as CodeGraphHostPort
}

describe('GetSpecCoverage', () => {
  it('returns found coverage with unique counts', async () => {
    const files = [
      createRelation({
        source: 'spec:core:foo',
        target: 'core:a.ts',
        type: RelationType.CoversFile,
      }),
      createRelation({
        source: 'spec:core:foo',
        target: 'core:a.ts',
        type: RelationType.CoversFile,
      }),
      createRelation({
        source: 'spec:core:foo',
        target: 'core:b.ts',
        type: RelationType.CoversFile,
      }),
    ]
    const symbols = [
      createRelation({ source: 'spec:core:foo', target: 'sym:1', type: RelationType.CoversSymbol }),
    ]

    const result = await new GetSpecCoverage().execute({
      provider: makeProvider({ files, symbols }),
      specId: 'core:foo',
    })

    expect(result.found).toBe(true)
    expect(result.fileCount).toBe(2)
    expect(result.symbolCount).toBe(1)
  })

  it('returns empty result when spec is not indexed', async () => {
    const result = await new GetSpecCoverage().execute({
      provider: makeProvider({ specFound: false }),
      specId: 'core:missing',
    })

    expect(result.found).toBe(false)
    expect(result.fileCount).toBe(0)
    expect(result.coveredFiles).toEqual([])
  })
})
