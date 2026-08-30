import { run as runSpecOverlap } from '../../domain/checks/spec-overlap.js'
import { type Change } from '../../domain/entities/change.js'
import {
  type Check,
  type CheckExecutionContext,
  type CheckId,
  type CheckKind,
} from '../../domain/services/transition-checks.js'
import { WorkflowCheck } from './workflow-check.js'

/** Overlap detection result for archive. */
export interface SpecOverlapDetection {
  /** True when other active changes share specs. */
  readonly blocked: boolean
  /** Optional human-readable detail. */
  readonly message?: string
  /** Named peers with overlapping spec ids when known. */
  readonly peers?: readonly {
    readonly changeName: string
    readonly overlappingSpecIds: readonly string[]
  }[]
}

/** Ports for `spec.overlap` I/O. */
export interface CreateSpecOverlapDeps {
  /** Detects peer overlap for the change being archived. */
  readonly detectSpecOverlap: (
    change: Change,
  ) => SpecOverlapDetection | Promise<SpecOverlapDetection>
}

/**
 * `spec.overlap` predicate.
 */
class SpecOverlapCheck extends WorkflowCheck {
  private readonly _detect: CreateSpecOverlapDeps['detectSpecOverlap']

  /**
   * Check identifier.
   *
   * @returns Check id
   */
  override get id(): CheckId {
    return 'spec.overlap'
  }

  /**
   * Predicate vs effect.
   *
   * @returns Check kind
   */
  override get kind(): CheckKind {
    return 'predicate'
  }

  /**
   * Creates the spec-overlap predicate.
   *
   * @param deps - Overlap detector port
   */
  constructor(deps: CreateSpecOverlapDeps) {
    super()
    this._detect = deps.detectSpecOverlap
  }

  /**
   * Evaluates this check using constructor ports.
   *
   * @param ctx - Host attempt context
   * @returns Check result
   */
  override async execute(ctx: CheckExecutionContext) {
    const detection = await this._detect(ctx.change)
    return runSpecOverlap({
      allowOverlap: ctx.allowOverlap,
      specOverlapBlocked: detection.blocked,
      ...(detection.message !== undefined ? { specOverlapMessage: detection.message } : {}),
      ...(detection.peers !== undefined && detection.peers.length > 0
        ? { specOverlapPeers: detection.peers }
        : {}),
    })
  }
}

/**
 * Creates the `spec.overlap` predicate check.
 *
 * @param deps - Overlap detector port
 * @param deps.detectSpecOverlap - Detects peer overlap for the change being archived
 * @returns WorkflowCheck-compatible instance
 */
export function createSpecOverlap(deps: CreateSpecOverlapDeps): Check {
  return new SpecOverlapCheck(deps)
}
