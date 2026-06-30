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
    const getSpecCoverage = {
      execute: vi.fn().mockResolvedValue({
        specId: 'core:foo',
        found: true,
        coveredFiles: [],
        coveredSymbols: [],
        fileCount: 1,
        symbolCount: 0,
      }),
    } as unknown as GetSpecCoverage

    const changes = {
      get: vi.fn().mockResolvedValue({ specIds: ['core:foo'] }),
    }

    const useCase = createGetChangeSpecCoverage(getSpecCoverage)
    const provider = {} as CodeGraphHostPort

    const result = await useCase.execute({
      provider,
      changes: changes as never,
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
