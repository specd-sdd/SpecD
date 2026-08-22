import { describe, expect, it, vi } from 'vitest'
import { GetGraphHealth } from '../../src/application/use-cases/get-graph-health.js'
import { IndexProjectGraph } from '../../src/application/use-cases/index-project-graph.js'
import { GetSpecCoverage } from '../../src/application/use-cases/get-spec-coverage.js'
import { GetChangeSpecCoverage } from '../../src/application/use-cases/get-change-spec-coverage.js'
import { type CodeGraphHostPort } from '../../src/application/ports/code-graph-host-port.js'
import { createGetGraphHealth } from '../../src/composition/use-cases/get-graph-health.js'
import { createIndexProjectGraph } from '../../src/composition/use-cases/index-project-graph.js'
import { createGetSpecCoverage } from '../../src/composition/use-cases/get-spec-coverage.js'
import { createGetChangeSpecCoverage } from '../../src/composition/use-cases/get-change-spec-coverage.js'
import { Change } from '@specd/core'
import { StubChangeRepository } from '../helpers/stub-change-repository.js'

describe('host use case factories', () => {
  it('createGetGraphHealth returns new stateless instances', () => {
    const first = createGetGraphHealth()
    const second = createGetGraphHealth()

    expect(first).toBeInstanceOf(GetGraphHealth)
    expect(second).toBeInstanceOf(GetGraphHealth)
    expect(first).not.toBe(second)
  })

  it('createIndexProjectGraph returns new stateless instances', () => {
    const first = createIndexProjectGraph()
    const second = createIndexProjectGraph()

    expect(first).toBeInstanceOf(IndexProjectGraph)
    expect(second).toBeInstanceOf(IndexProjectGraph)
    expect(first).not.toBe(second)
  })

  it('createGetSpecCoverage returns new stateless instances', () => {
    const first = createGetSpecCoverage()
    const second = createGetSpecCoverage()

    expect(first).toBeInstanceOf(GetSpecCoverage)
    expect(second).toBeInstanceOf(GetSpecCoverage)
    expect(first).not.toBe(second)
  })

  it('createGetChangeSpecCoverage delegates to injected GetSpecCoverage', async () => {
    const getSpecCoverage: GetSpecCoverage = {
      execute: vi.fn().mockResolvedValue({
        specId: 'core:foo',
        found: true,
        coveredFiles: [],
        coveredSymbols: [],
        fileCount: 1,
        symbolCount: 0,
      }),
    }

    const changes = new StubChangeRepository(
      new Map([
        [
          'change-1',
          new Change({
            name: 'change-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            specIds: ['core:foo'],
            history: [],
          }),
        ],
      ]),
    )

    const useCase = createGetChangeSpecCoverage(getSpecCoverage)
    const provider = {} as CodeGraphHostPort

    const result = await useCase.execute({
      provider,
      changes,
      changeName: 'change-1',
    })

    expect(useCase).toBeInstanceOf(GetChangeSpecCoverage)
    expect(getSpecCoverage.execute).toHaveBeenCalledWith({
      provider,
      specId: 'core:foo',
    })
    expect(result.changeName).toBe('change-1')
  })
})
