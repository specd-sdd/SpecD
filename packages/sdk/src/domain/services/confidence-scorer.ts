import {
  type ConfidenceBreakdown,
  type SpecCategory,
} from '../value-objects/candidate-spec.js'

/**
 * Input metrics used to calculate confidence score.
 */
export interface ConfidenceInputs {
  readonly maxHotspotScore: number
  readonly totalIncomingCallers: number
  readonly totalCrossWorkspaceCallers: number
  readonly hasPrimaryClasses: boolean
  readonly category: SpecCategory
  readonly hasAnchorSymbols: boolean
  readonly fileCount: number
  readonly symbolCount: number
  readonly hasPublicExports: boolean
  readonly testSuitesCount: number
}

/**
 * Pure domain service for evaluating candidate specification confidence deterministically.
 */
export class ConfidenceScorer {
  /**
   * Computes deterministic 5-factor confidence breakdown and total score.
   *
   * @param inputs - Objective structural metrics from code graph and AST.
   * @returns Confidence breakdown, normalized float confidence (0.0 - 1.0), and priority.
   */
  static compute(inputs: ConfidenceInputs): {
    score: number
    breakdown: ConfidenceBreakdown
    priority: 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)'
  } {
    // 1. Caller & Hotspot Evidence (0..25)
    let callerEvidence = 10
    if (inputs.maxHotspotScore > 0) {
      callerEvidence += 8
    }
    if (inputs.totalIncomingCallers > 2) {
      callerEvidence += 4
    }
    if (inputs.totalCrossWorkspaceCallers > 0) {
      callerEvidence += 3
    }
    callerEvidence = Math.min(25, Math.max(0, callerEvidence))

    // 2. Architectural Clarity & Invariants (0..25)
    let architecturalClarity = 14
    if (inputs.hasPrimaryClasses) {
      architecturalClarity += 5
    }
    if (
      inputs.category === 'APPLICATION_USE_CASE' ||
      inputs.category === 'CORE_DOMAIN_ENTITY' ||
      inputs.category === 'PORT_OR_CONTRACT'
    ) {
      architecturalClarity += 4
    }
    if (inputs.hasAnchorSymbols) {
      architecturalClarity += 2
    }
    architecturalClarity = Math.min(25, Math.max(0, architecturalClarity))

    // 3. Graph Coupling & Cohesion (0..20)
    let graphCouplingCohesion = 12
    if (inputs.fileCount >= 1 && inputs.fileCount <= 12) {
      graphCouplingCohesion += 5
    }
    if (inputs.symbolCount >= 2) {
      graphCouplingCohesion += 3
    }
    graphCouplingCohesion = Math.min(20, Math.max(0, graphCouplingCohesion))

    // 4. Public Surface & Entrypoints (0..15)
    let publicSurface = 10
    if (inputs.hasPublicExports) {
      publicSurface += 3
    }
    if (inputs.category === 'PUBLIC_INTERFACE_API' || inputs.category === 'PORT_OR_CONTRACT') {
      publicSurface += 2
    }
    publicSurface = Math.min(15, Math.max(0, publicSurface))

    // 5. Test Alignment Evidence (0..15)
    let testAlignmentEvidence = 12
    if (inputs.testSuitesCount > 0) {
      testAlignmentEvidence += 3
    }
    testAlignmentEvidence = Math.min(15, Math.max(0, testAlignmentEvidence))

    const total =
      callerEvidence +
      architecturalClarity +
      graphCouplingCohesion +
      publicSurface +
      testAlignmentEvidence

    const normalizedScore = Number((total / 100).toFixed(2))

    let priority: 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)' = 'P2 (Medium)'
    if (
      inputs.maxHotspotScore >= 15 ||
      inputs.totalCrossWorkspaceCallers >= 3 ||
      (inputs.category === 'APPLICATION_USE_CASE' && total >= 85)
    ) {
      priority = 'P0 (Critical)'
    } else if (total >= 75 || inputs.category === 'CORE_DOMAIN_ENTITY') {
      priority = 'P1 (High)'
    }

    return {
      score: normalizedScore,
      breakdown: {
        callerEvidence,
        architecturalClarity,
        graphCouplingCohesion,
        publicSurface,
        testAlignmentEvidence,
        total,
      },
      priority,
    }
  }
}
