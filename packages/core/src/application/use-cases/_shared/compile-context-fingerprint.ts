import { createHash } from 'node:crypto'
import type {
  AvailableStep,
  ContextSpecEntry,
  ProjectContextEntry,
  ContextWarning,
  SpecSection,
} from '../compile-context.js'

/**
 * Input for fingerprint calculation.
 */
export interface FingerprintInput {
  readonly contextMode: 'list' | 'summary' | 'full' | 'hybrid'
  readonly includeChangeSpecs: boolean
  readonly followDeps: boolean
  readonly depth?: number
  readonly sections: readonly SpecSection[]
  readonly stepAvailable: boolean
  readonly blockingArtifacts: readonly string[]
  readonly projectContext: readonly ProjectContextEntry[]
  readonly specs: readonly ContextSpecEntry[]
  readonly availableSteps: readonly AvailableStep[]
  readonly warnings: readonly ContextWarning[]
}

/**
 * Calculates a SHA-256 fingerprint from the assembled logical context result.
 * The fingerprint is deterministic and changes when any emitted output changes.
 *
 * @param input - The fingerprint input containing all context-relevant values
 * @returns SHA-256 hash prefixed with 'sha256:'
 */
export function compileContextFingerprint(input: FingerprintInput): string {
  const canonical = JSON.stringify({
    contextMode: input.contextMode,
    includeChangeSpecs: input.includeChangeSpecs,
    followDeps: input.followDeps,
    ...(input.depth !== undefined ? { depth: input.depth } : {}),
    sections: [...input.sections],
    stepAvailable: input.stepAvailable,
    blockingArtifacts: [...input.blockingArtifacts],
    projectContext: input.projectContext.map((entry) =>
      entry.source === 'file'
        ? {
            source: entry.source,
            path: entry.path ?? '',
            content: entry.content,
          }
        : {
            source: entry.source,
            content: entry.content,
          },
    ),
    specs: input.specs.map((spec) => ({
      specId: spec.specId,
      title: spec.title,
      description: spec.description,
      source: spec.source,
      mode: spec.mode,
      ...(spec.content !== undefined ? { content: spec.content } : {}),
    })),
    availableSteps: input.availableSteps.map((step) => ({
      step: step.step,
      available: step.available,
      blockingArtifacts: [...step.blockingArtifacts],
    })),
    warnings: input.warnings.map((warning) => ({
      type: warning.type,
      path: warning.path,
      message: warning.message,
    })),
  })
  const hash = createHash('sha256').update(canonical).digest('hex')
  return `sha256:${hash}`
}
