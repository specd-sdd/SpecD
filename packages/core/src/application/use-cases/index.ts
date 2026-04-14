export { type ListChanges } from './list-changes.js'
export { type ListDrafts } from './list-drafts.js'
export { type ListDiscarded } from './list-discarded.js'
export { type ListArchived } from './list-archived.js'
export { type GetArchivedChange, type GetArchivedChangeInput } from './get-archived-change.js'
export { type EditChange, type EditChangeInput, type EditChangeResult } from './edit-change.js'
export { type SkipArtifact, type SkipArtifactInput } from './skip-artifact.js'
export {
  type UpdateSpecDeps,
  type UpdateSpecDepsInput,
  type UpdateSpecDepsResult,
} from './update-spec-deps.js'
export { type ListSpecs, type SpecListEntry, type SpecMetadataStatus } from './list-specs.js'
export { type GetSpec, type GetSpecInput, type GetSpecResult } from './get-spec.js'
export {
  type SaveSpecMetadata,
  type SaveSpecMetadataInput,
  type SaveSpecMetadataResult,
} from './save-spec-metadata.js'
export {
  type InvalidateSpecMetadata,
  type InvalidateSpecMetadataInput,
  type InvalidateSpecMetadataResult,
} from './invalidate-spec-metadata.js'
export {
  type GetActiveSchema,
  type GetActiveSchemaInput,
  type GetActiveSchemaOptions,
  type GetActiveSchemaResult,
  type GetActiveSchemaResolved,
  type GetActiveSchemaRaw,
} from './get-active-schema.js'
export { type ResolveSchema } from './resolve-schema.js'
export {
  type ValidateSchema,
  type ValidateSchemaInput,
  type ValidateSchemaResult,
} from './validate-schema.js'
export { type InitProject } from './init-project.js'
export { type RecordSkillInstall, type RecordSkillInstallInput } from './record-skill-install.js'
export { type GetSkillsManifest, type GetSkillsManifestInput } from './get-skills-manifest.js'
export {
  type GetProjectContext,
  type GetProjectContextInput,
  type GetProjectContextResult,
} from './get-project-context.js'
export { type CreateChange, type CreateChangeInput } from './create-change.js'
export {
  type GetStatus,
  type GetStatusInput,
  type GetStatusResult,
  type ArtifactStatusEntry,
  type LifecycleContext,
  type TransitionBlocker,
  type ReviewSummary,
  type ReviewOverlapEntry,
} from './get-status.js'
export {
  type HookPhaseSelector,
  type TransitionChange,
  type TransitionChangeInput,
  type TransitionChangeResult,
  type TransitionProgressEvent,
  type OnTransitionProgress,
} from './transition-change.js'
export { type DraftChange, type DraftChangeInput } from './draft-change.js'
export { type RestoreChange, type RestoreChangeInput } from './restore-change.js'
export { type DiscardChange, type DiscardChangeInput } from './discard-change.js'
export { type ApproveSpec, type ApproveSpecInput } from './approve-spec.js'
export { type ApproveSignoff, type ApproveSignoffInput } from './approve-signoff.js'
export {
  type ArchiveHookPhaseSelector,
  type ArchiveChange,
  type ArchiveChangeInput,
  type ArchiveChangeResult,
  type InvalidatedChangesEntry,
} from './archive-change.js'
export {
  type ValidateArtifacts,
  type ValidateArtifactsInput,
  type ValidateArtifactsResult,
  type ValidationFailure,
  type ValidationWarning,
} from './validate-artifacts.js'
export {
  type CompileContext,
  type CompileContextInput,
  type CompileContextResult,
  type CompileContextConfig,
  type ContextEntry,
  type WorkspaceContextConfig,
  type ContextWarning,
  type ContextSpecEntry,
  type ContextSpecSource,
  type ProjectContextEntry,
  type AvailableStep,
  type SpecSection,
} from './compile-context.js'
export {
  checkMetadataFreshness,
  type ContentHashEntry,
  type MetadataFreshnessResult,
} from './_shared/metadata-freshness.js'
export { computeArtifactHash, buildCleanupMap } from './_shared/compute-artifact-hash.js'
export { parseMetadata } from './_shared/parse-metadata.js'
export {
  type GenerateSpecMetadata,
  type GenerateSpecMetadataInput,
  type GenerateSpecMetadataResult,
} from './generate-spec-metadata.js'
export {
  type GetSpecContext,
  type GetSpecContextInput,
  type GetSpecContextResult,
  type SpecContextEntry,
  type SpecContextSectionFlag,
} from './get-spec-context.js'
export {
  type ValidateSpecs,
  type ValidateSpecsInput,
  type ValidateSpecsResult,
  type SpecValidationEntry,
} from './validate-specs.js'
export {
  type RunStepHooks,
  type RunStepHooksInput,
  type RunStepHooksResult,
  type RunStepHookEntry,
  type HookProgressEvent,
  type OnHookProgress,
} from './run-step-hooks.js'
export {
  type GetHookInstructions,
  type GetHookInstructionsInput,
  type GetHookInstructionsResult,
} from './get-hook-instructions.js'
export { type DetectOverlap, type DetectOverlapInput } from './detect-overlap.js'
export {
  type GetArtifactInstruction,
  type GetArtifactInstructionInput,
  type GetArtifactInstructionResult,
} from './get-artifact-instruction.js'
export {
  type PreviewSpec,
  type PreviewSpecInput,
  type PreviewSpecResult,
  type PreviewSpecFileEntry,
} from './preview-spec.js'
