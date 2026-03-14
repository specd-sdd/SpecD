import { describe, it, expect } from 'vitest'
import { computeRiskLevel } from '../../../src/domain/value-objects/risk-level.js'

describe('computeRiskLevel', () => {
  it('returns LOW for 0-2 direct, no indirect', () => {
    expect(computeRiskLevel(0, 0, 0)).toBe('LOW')
    expect(computeRiskLevel(1, 1, 0)).toBe('LOW')
    expect(computeRiskLevel(2, 2, 0)).toBe('LOW')
  })

  it('returns MEDIUM for 3-5 direct or any indirect', () => {
    expect(computeRiskLevel(3, 3, 0)).toBe('MEDIUM')
    expect(computeRiskLevel(5, 5, 0)).toBe('MEDIUM')
    expect(computeRiskLevel(1, 3, 0)).toBe('MEDIUM')
  })

  it('returns HIGH for 6+ direct or 10+ total', () => {
    expect(computeRiskLevel(6, 6, 0)).toBe('HIGH')
    expect(computeRiskLevel(2, 10, 0)).toBe('HIGH')
  })

  it('returns CRITICAL for 20+ total or 3+ processes', () => {
    expect(computeRiskLevel(1, 20, 0)).toBe('CRITICAL')
    expect(computeRiskLevel(1, 1, 3)).toBe('CRITICAL')
  })
})
