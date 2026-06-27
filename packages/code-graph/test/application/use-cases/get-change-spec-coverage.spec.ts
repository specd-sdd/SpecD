import { describe, expect, it, vi } from 'vitest'
import { ChangeNotFoundError, type ChangeRepository } from '@specd/core'
import { GetChangeSpecCoverage } from '../../../src/application/use-cases/get-change-spec-coverage.js'
import {
  GetSpecCoverage,
  type GetSpecCoverageResult,
} from '../../../src/application/use-cases/get-spec-coverage.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'

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

describe('GetChangeSpecCoverage', () => {
  it('returns coverage in manifest order', async () => {
    const getSpecCoverage = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(coverageFor('core:a'))
        .mockResolvedValueOnce(coverageFor('cli:b')),
    } as unknown as GetSpecCoverage

    const changes = {
      get: vi.fn().mockResolvedValue({ specIds: ['core:a', 'cli:b'] }),
    } as unknown as ChangeRepository

    const result = await new GetChangeSpecCoverage(getSpecCoverage).execute({
      provider: {} as CodeGraphHostPort,
      changes,
      changeName: 'my-change',
    })

    expect(result.specs.map((entry) => entry.specId)).toEqual(['core:a', 'cli:b'])
    expect(getSpecCoverage.execute).toHaveBeenCalledTimes(2)
  })

  it('throws ChangeNotFoundError when change is missing', async () => {
    const changes = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as ChangeRepository

    await expect(
      new GetChangeSpecCoverage({ execute: vi.fn() } as unknown as GetSpecCoverage).execute({
        provider: {} as CodeGraphHostPort,
        changes,
        changeName: 'missing',
      }),
    ).rejects.toThrow(ChangeNotFoundError)
  })
})
