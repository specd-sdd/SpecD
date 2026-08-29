export { applyPreHashCleanup } from './pre-hash-cleanup.js'
export {
  expectedArtifactFilename,
  type ExpectedArtifactFilenameInput,
} from './artifact-filename.js'
export { hashFiles } from './hash-files.js'
export {
  projectMetadataSchema,
  updateProjectMetadataSchema,
  type ProjectMetadata,
  type UpdateProjectMetadataPayload,
} from './project-metadata.js'
export {
  specMetadataSchema,
  strictSpecMetadataSchema,
  type SpecMetadata,
} from './parse-metadata.js'
export {
  parseSpecLock,
  specLockSchema,
  type SpecLockData,
  type SpecLockImplementationEntry,
} from './parse-spec-lock.js'
export { parseSpecId } from './parse-spec-id.js'
export { extractSpecSummary } from './spec-summary.js'
export { inferFormat } from './format-inference.js'
export { safeRegex } from './safe-regex.js'
export { shiftHeadings } from './shift-headings.js'
export {
  extractContent,
  type ExtractorTransformResult,
  type ExtractorTransform,
  type ExtractorTransformContext,
  type ExtractorTransformRegistry,
  type SubtreeRenderer,
  type GroupedExtraction,
  type StructuredExtraction,
} from './content-extraction.js'
export { extractMetadata, type ExtractedMetadata } from './extract-metadata.js'
export {
  buildSchema,
  buildSelector,
  type SchemaYamlData,
  type ArtifactYamlData,
  type SelectorRaw,
  type ValidationRuleRaw,
  type CrossArtifactValidationRuleRaw,
  type CrossArtifactParticipantRaw,
  type CrossArtifactRelationRaw,
  type MetadataExtractionRaw,
  type RuleEntryRaw,
  type ArtifactRulesRaw,
} from './build-schema.js'
export {
  mergeSchemaLayers,
  type SchemaLayer,
  type SchemaLayerSource,
  type SchemaOperations,
} from './merge-schema-layers.js'
export {
  type SelectorNode,
  findNodes,
  nodeMatches,
  collectAll,
  selectBySelector,
  collectAllNodes,
} from './selector-matching.js'
export {
  evaluateCrossArtifactRule,
  type CrossArtifactEvaluationFailure,
  type CrossArtifactEvaluationWarning,
  type CrossArtifactParticipantInput,
  type CrossArtifactEvaluationContext,
  type CrossArtifactEvaluationResult,
} from './cross-artifact-rule-evaluator.js'
export {
  evaluateRules,
  selectNodes,
  collectNodes,
  selectByJsonPath,
  tokenizeJsonPath,
  recursiveCollect,
  type RuleEvaluationFailure,
  type RuleEvaluationWarning,
  type RuleEvaluationResult,
  type RuleEvaluatorNode,
  type RuleEvaluatorParser,
} from './rule-evaluator.js'
export {
  detectSpecOverlap,
  specOverlapDetectionForChange,
  type SpecOverlapDetectionSummary,
  type SpecOverlapPeerSummary,
} from './detect-spec-overlap.js'
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
export {
  classifyAlong,
  checkMatches,
  CHECK_LABELS,
  checkLabel,
  type CheckId,
  type CheckKind,
  type CheckResult,
  type CheckApplicability,
  type TransitionAlong,
  type TaskCompletionCounts,
  type Check,
  type CheckBinding,
  type CheckBindingSpec,
  type CheckExecutionContext,
  type CheckAttempt,
  type CheckProgressEvent,
  type OnCheckProgress,
  type EffectPipelinePhase,
  type EffectOnFailure,
  isEffectCheck,
  applyBindingSpecs,
} from './transition-checks.js'
export {
  TRANSITION_BINDINGS,
  ARCHIVE_BINDINGS,
  TRANSITION_BINDING_SPECS,
  ARCHIVE_BINDING_SPECS,
  boundFromStates,
  boundToStates,
} from './check-bindings.js'
export {
  bindingMatches,
  runDepsConsistent,
  runWorkspaceReadOnly,
  runImplFilesResolved,
  runImplLinksInScope,
} from './evaluate-transition-predicates.js'
