/** Re-exports the domain lifecycle verdict functions implemented in `lifecycle-verdict.ts`. */
export {
  evaluateLifecycleVerdict,
  projectArtifacts,
  findBlockingParent,
  resolveLifecycleNextHop,
  type ArtifactGraphSource,
  type LifecycleVerdictInput,
  type LifecycleAffectedFile,
  type LifecycleAffectedArtifact,
  type LifecycleBlocker,
  type LifecycleReviewOverlapEntry,
  type LifecycleReviewSummary,
  type LifecycleNextHop,
  type LifecycleDomainVerdict,
  type LifecycleArtifactVerdict,
  type LifecycleTransitionBlocker,
  type LifecycleStepVerdict,
} from './lifecycle-verdict.js'
