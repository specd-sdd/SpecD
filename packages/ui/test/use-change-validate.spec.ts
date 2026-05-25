import { describe, expect, it, vi } from 'vitest'
import {
  buildValidateConfirmMessage,
  deriveArtifactIdFromFilename,
  flattenBatchValidateResult,
  runChangeValidation,
} from '../src/hooks/use-change-validate.js'

describe('deriveArtifactIdFromFilename', () => {
  it('maps delta spec path to specs artifact id', () => {
    expect(deriveArtifactIdFromFilename('deltas/core/change/spec.md.delta.yaml')).toBe('specs')
  })

  it('maps change-scoped proposal file', () => {
    expect(deriveArtifactIdFromFilename('proposal.md')).toBe('proposal')
  })
})

describe('buildValidateConfirmMessage', () => {
  it('warns about DAG invalidation and drift', () => {
    const message = buildValidateConfirmMessage('all', 'specd-studio')
    expect(message).toContain('specd-studio')
    expect(message.toLowerCase()).toContain('invalidate')
    expect(message.toLowerCase()).toContain('drift')
    expect(message).toContain('Continue?')
  })

  it('includes filename for artifact scope', () => {
    const message = buildValidateConfirmMessage(
      'artifact',
      'specd-studio',
      'deltas/core/change/spec.md.delta.yaml',
    )
    expect(message).toContain('deltas/core/change/spec.md.delta.yaml')
  })
})

describe('flattenBatchValidateResult', () => {
  it('merges step failures and warnings', () => {
    const flat = flattenBatchValidateResult({
      passed: false,
      total: 2,
      results: [
        {
          spec: 'core:a',
          artifact: 'specs',
          passed: true,
          failures: [],
          warnings: ['note a'],
          files: ['a.md'],
        },
        {
          spec: 'core:b',
          artifact: 'specs',
          passed: false,
          failures: [{ message: 'blocked', artifactId: 'specs' }],
          warnings: [],
          files: [],
        },
      ],
    })
    expect(flat.passed).toBe(false)
    expect(flat.failures).toHaveLength(1)
    expect(flat.warnings).toEqual(['note a'])
    expect(flat.files).toEqual(['a.md'])
  })
})

describe('runChangeValidation', () => {
  it('calls validateChange with specId and artifactId for scoped artifact', async () => {
    const validateChange = vi.fn().mockResolvedValue({
      passed: true,
      failures: [],
      warnings: [],
      files: [],
    })
    const validateChangeAll = vi.fn()
    const port = { validateChange, validateChangeAll } as never

    await runChangeValidation(port, 'specd-studio', {
      filename: 'deltas/core/change/spec.md.delta.yaml',
    })

    expect(validateChange).toHaveBeenCalledWith('specd-studio', {
      specId: 'core:change',
      artifactId: 'specs',
    })
    expect(validateChangeAll).not.toHaveBeenCalled()
  })

  it('calls validateChangeAll once when validating entire change', async () => {
    const validateChange = vi.fn()
    const validateChangeAll = vi.fn().mockResolvedValue({
      passed: true,
      total: 2,
      results: [],
    })
    const port = { validateChange, validateChangeAll } as never

    await runChangeValidation(port, 'specd-studio', {})

    expect(validateChangeAll).toHaveBeenCalledTimes(1)
    expect(validateChangeAll).toHaveBeenCalledWith('specd-studio', {})
    expect(validateChange).not.toHaveBeenCalled()
  })

  it('passes artifactId filter to validateChangeAll', async () => {
    const validateChangeAll = vi.fn().mockResolvedValue({
      passed: true,
      total: 1,
      results: [],
    })
    const port = { validateChange: vi.fn(), validateChangeAll } as never

    await runChangeValidation(port, 'specd-studio', { artifactId: 'tasks' })

    expect(validateChangeAll).toHaveBeenCalledWith('specd-studio', { artifactId: 'tasks' })
  })
})
