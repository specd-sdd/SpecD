import { describe, it, expect } from 'vitest'
import { ConfidenceScorer } from '../../../src/domain/services/confidence-scorer.js'

describe('ConfidenceScorer', () => {
  it('computes high confidence (>= 80%) for cohesive use case with tests and callers', () => {
    const { score, breakdown, priority } = ConfidenceScorer.compute({
      maxHotspotScore: 18,
      totalIncomingCallers: 8,
      totalCrossWorkspaceCallers: 2,
      hasPrimaryClasses: true,
      category: 'APPLICATION_USE_CASE',
      hasAnchorSymbols: true,
      fileCount: 3,
      symbolCount: 5,
      hasPublicExports: true,
      testSuitesCount: 1,
    })

    expect(score).toBeGreaterThanOrEqual(0.8)
    expect(breakdown.callerEvidence).toBe(25) // 10 + 8 + 4 + 3 = 25
    expect(breakdown.architecturalClarity).toBe(25) // 14 + 5 + 4 + 2 = 25
    expect(breakdown.graphCouplingCohesion).toBe(20) // 12 + 5 + 3 = 20
    expect(breakdown.publicSurface).toBe(13) // 10 + 3 = 13
    expect(breakdown.testAlignmentEvidence).toBe(15) // 12 + 3 = 15
    expect(breakdown.total).toBe(98)
    expect(score).toBe(0.98)
    expect(priority).toBe('P0 (Critical)')
  })

  it('computes lower score for isolated utility without callers or tests', () => {
    const { score, breakdown, priority } = ConfidenceScorer.compute({
      maxHotspotScore: 0,
      totalIncomingCallers: 0,
      totalCrossWorkspaceCallers: 0,
      hasPrimaryClasses: false,
      category: 'UTILITY_SUPPORT',
      hasAnchorSymbols: false,
      fileCount: 1,
      symbolCount: 1,
      hasPublicExports: false,
      testSuitesCount: 0,
    })

    expect(score).toBeLessThan(0.7)
    expect(breakdown.callerEvidence).toBe(10)
    expect(breakdown.architecturalClarity).toBe(14)
    expect(breakdown.graphCouplingCohesion).toBe(17) // 12 + 5 = 17
    expect(breakdown.publicSurface).toBe(10)
    expect(breakdown.testAlignmentEvidence).toBe(12)
    expect(breakdown.total).toBe(63)
    expect(score).toBe(0.63)
    expect(priority).toBe('P2 (Medium)')
  })

  it('assigns P1 priority for core domain entities with good structural clarity', () => {
    const { priority } = ConfidenceScorer.compute({
      maxHotspotScore: 5,
      totalIncomingCallers: 1,
      totalCrossWorkspaceCallers: 0,
      hasPrimaryClasses: true,
      category: 'CORE_DOMAIN_ENTITY',
      hasAnchorSymbols: true,
      fileCount: 2,
      symbolCount: 3,
      hasPublicExports: true,
      testSuitesCount: 1,
    })

    expect(priority).toBe('P1 (High)')
  })
})
