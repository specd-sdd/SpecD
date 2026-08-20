import { describe, expect, it, vi } from 'vitest'
import { Change, ChangeNotFoundError } from '@specd/core'
import { GetChangeSpecCoverage } from '../../../src/application/use-cases/get-change-spec-coverage.js'
import {
  GetSpecCoverage,
  type GetSpecCoverageResult,
} from '../../../src/application/use-cases/get-spec-coverage.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { StubChangeRepository } from '../../helpers/stub-change-repository.js'

function coverageFor(specId: string): GetSpecCoverageResult {
  return {
    specId,
    found: true,
    coveredFiles: [],
    coveredSymbols: [],
    fileCount: 0,
    symbolCount: 0,
  }
}

function makeChange(specIds: readonly string[]): Change {
  return new Change({
    name: 'my-change',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    specIds,
    history: [],
  })
}

function makeGetSpecCoverageMock(results: GetSpecCoverageResult[]): GetSpecCoverage {
  return {
    execute: vi.fn().mockImplementation(async (input: { specId: string }) => {
      const result = results.shift() ?? coverageFor(input.specId)
      return result
    }),
  }
}

describe('GetChangeSpecCoverage', () => {
  it('returns coverage in manifest order', async () => {
    const getSpecCoverage = makeGetSpecCoverageMock([coverageFor('core:a'), coverageFor('cli:b')])

    const changes = new StubChangeRepository(
      new Map([['my-change', makeChange(['core:a', 'cli:b'])] as const]),
    )

    const result = await new GetChangeSpecCoverage(getSpecCoverage).execute({
      provider: {} as CodeGraphHostPort,
      changes,
      changeName: 'my-change',
    })

    expect(result.specs.map((entry) => entry.specId)).toEqual(['core:a', 'cli:b'])
    expect(getSpecCoverage.execute).toHaveBeenCalledTimes(2)
  })

  it('throws ChangeNotFoundError when change is missing', async () => {
    const changes = new StubChangeRepository()

    await expect(
      new GetChangeSpecCoverage(makeGetSpecCoverageMock([])).execute({
        provider: {} as CodeGraphHostPort,
        changes,
        changeName: 'missing',
      }),
    ).rejects.toThrow(ChangeNotFoundError)
  })
})
