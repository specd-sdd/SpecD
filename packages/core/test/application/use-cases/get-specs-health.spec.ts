import { describe, expect, it, vi } from 'vitest'
import { GetSpecsHealth } from '../../../src/application/use-cases/get-specs-health.js'
import { ValidateSpecs } from '../../../src/application/use-cases/validate-specs.js'
import { type SpecValidationEntry } from '../../../src/application/ports/validation-result-cache.js'

function makeMockValidateSpecs(entries: SpecValidationEntry[], totalSpecs = entries.length) {
  const mock = {
    execute: vi.fn().mockResolvedValue({
      entries,
      totalSpecs,
      passed: entries.filter((e) => e.passed).length,
      failed: entries.filter((e) => !e.passed).length,
    }),
  } as unknown as ValidateSpecs
  return mock
}

describe('GetSpecsHealth', () => {
  it('returns empty issues list and all counters at 0 when no specs are validated', async () => {
    const mockValidateSpecs = makeMockValidateSpecs([], 0)
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    const result = await useCase.execute()

    expect(result).toEqual({
      totalSpecs: 0,
      passed: 0,
      failed: 0,
      warned: 0,
      issues: [],
    })
  })

  it('counts clean specs under passed and does not add them to issues', async () => {
    const entries: SpecValidationEntry[] = [
      {
        spec: 'core:a',
        passed: true,
        failures: [],
        warnings: [],
      },
      {
        spec: 'core:b',
        passed: true,
        failures: [],
        warnings: [],
      },
    ]

    const mockValidateSpecs = makeMockValidateSpecs(entries)
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    const result = await useCase.execute()

    expect(result).toEqual({
      totalSpecs: 2,
      passed: 2,
      failed: 0,
      warned: 0,
      issues: [],
    })
  })

  it('counts specs with failures under failed and adds their errors to issues with passed: false', async () => {
    const entries: SpecValidationEntry[] = [
      {
        spec: 'core:a',
        passed: true,
        failures: [],
        warnings: [],
      },
      {
        spec: 'core:b',
        passed: false,
        failures: [{ artifactId: 'specs', description: 'Missing file' }],
        warnings: [],
      },
    ]

    const mockValidateSpecs = makeMockValidateSpecs(entries)
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    const result = await useCase.execute()

    expect(result).toEqual({
      totalSpecs: 2,
      passed: 1,
      failed: 1,
      warned: 0,
      issues: [
        {
          spec: 'core:b',
          passed: false,
          failures: [{ artifactId: 'specs', description: 'Missing file' }],
          warnings: [],
        },
      ],
    })
  })

  it('counts specs with warnings but no failures under warned and adds their warnings to issues with passed: true', async () => {
    const entries: SpecValidationEntry[] = [
      {
        spec: 'core:a',
        passed: true,
        failures: [],
        warnings: [{ artifactId: 'verify', description: 'Deferred rule' }],
      },
    ]

    const mockValidateSpecs = makeMockValidateSpecs(entries)
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    const result = await useCase.execute()

    expect(result).toEqual({
      totalSpecs: 1,
      passed: 0,
      failed: 0,
      warned: 1,
      issues: [
        {
          spec: 'core:a',
          passed: true,
          failures: [],
          warnings: [{ artifactId: 'verify', description: 'Deferred rule' }],
        },
      ],
    })
  })

  it('counts specs with both failures and warnings under failed and consolidates both in the issues array entry', async () => {
    const entries: SpecValidationEntry[] = [
      {
        spec: 'core:a',
        passed: false,
        failures: [{ artifactId: 'specs', description: 'Schema violation' }],
        warnings: [{ artifactId: 'verify', description: 'Deferred rule' }],
      },
    ]

    const mockValidateSpecs = makeMockValidateSpecs(entries)
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    const result = await useCase.execute()

    expect(result).toEqual({
      totalSpecs: 1,
      passed: 0,
      failed: 1,
      warned: 0,
      issues: [
        {
          spec: 'core:a',
          passed: false,
          failures: [{ artifactId: 'specs', description: 'Schema violation' }],
          warnings: [{ artifactId: 'verify', description: 'Deferred rule' }],
        },
      ],
    })
  })

  it('delegates workspace filter correctly to ValidateSpecs', async () => {
    const mockValidateSpecs = makeMockValidateSpecs([])
    const useCase = new GetSpecsHealth(mockValidateSpecs)

    await useCase.execute({ workspace: 'cli' })

    expect(mockValidateSpecs.execute).toHaveBeenCalledWith({ workspace: 'cli' })
  })
})
