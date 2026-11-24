import { cliError } from '../../handle-error.js'

/** Artifact invalidation dimension accepted by create, edit, and invalidate. */
export type ArtifactPolicyFlag = 'none' | 'surgical' | 'downstream' | 'global'

/** Workflow invalidation dimension accepted by create, edit, and invalidate. */
export type WorkflowPolicyFlag = 'preserve' | 'redesign'

/** Complete structured policy passed to create. */
export interface StructuredInvalidationPolicy {
  readonly artifacts: ArtifactPolicyFlag
  readonly workflow: WorkflowPolicyFlag
}

/** Partial overlay passed to edit and invalidate. Omitted keys stay unchanged in Core. */
export interface InvalidationPolicyFlagOverride {
  readonly artifacts?: ArtifactPolicyFlag
  readonly workflow?: WorkflowPolicyFlag
}

const ARTIFACT_POLICIES: readonly ArtifactPolicyFlag[] = [
  'none',
  'surgical',
  'downstream',
  'global',
]

const WORKFLOW_POLICIES: readonly WorkflowPolicyFlag[] = ['preserve', 'redesign']

/** Native default when project config has no structured `invalidation` value. */
const NATIVE_DEFAULT_POLICY: StructuredInvalidationPolicy = {
  artifacts: 'downstream',
  workflow: 'preserve',
}

/**
 * Narrows a string to an artifact policy flag.
 *
 * @param value - Raw CLI value
 * @returns Whether the value is a known artifact policy
 */
function isArtifactPolicyFlag(value: string): value is ArtifactPolicyFlag {
  return (ARTIFACT_POLICIES as readonly string[]).includes(value)
}

/**
 * Narrows a string to a workflow policy flag.
 *
 * @param value - Raw CLI value
 * @returns Whether the value is a known workflow policy
 */
function isWorkflowPolicyFlag(value: string): value is WorkflowPolicyFlag {
  return (WORKFLOW_POLICIES as readonly string[]).includes(value)
}

/**
 * Parses `--artifact-policy`, rejecting unknown values before any use-case call.
 *
 * @param value - Commander option value, when the flag was supplied
 * @param format - Output format used by {@link cliError}
 * @returns The parsed dimension, or `undefined` when the flag was omitted
 */
export function parseArtifactPolicyFlag(
  value: string | undefined,
  format: string | undefined,
): ArtifactPolicyFlag | undefined {
  if (value === undefined) return undefined
  if (isArtifactPolicyFlag(value)) return value
  cliError(
    `invalid --artifact-policy '${value}'. valid values: ${ARTIFACT_POLICIES.join(', ')}`,
    format,
  )
}

/**
 * Parses `--workflow-policy`, rejecting unknown values before any use-case call.
 *
 * @param value - Commander option value, when the flag was supplied
 * @param format - Output format used by {@link cliError}
 * @returns The parsed dimension, or `undefined` when the flag was omitted
 */
export function parseWorkflowPolicyFlag(
  value: string | undefined,
  format: string | undefined,
): WorkflowPolicyFlag | undefined {
  if (value === undefined) return undefined
  if (isWorkflowPolicyFlag(value)) return value
  cliError(
    `invalid --workflow-policy '${value}'. valid values: ${WORKFLOW_POLICIES.join(', ')}`,
    format,
  )
}

/**
 * Reads `config.invalidation` when it is already a structured policy.
 *
 * Omitted or non-object values fall back to the native default. Each supplied
 * flag replaces only that dimension.
 *
 * @param config - Loaded project config
 * @param artifacts - Explicit artifact flag, when supplied
 * @param workflow - Explicit workflow flag, when supplied
 * @returns A complete policy for `CreateChange`
 */
export function resolveCreateInvalidationPolicy(
  config: object,
  artifacts: ArtifactPolicyFlag | undefined,
  workflow: WorkflowPolicyFlag | undefined,
): StructuredInvalidationPolicy {
  const base = readConfiguredPolicy(config)
  return {
    artifacts: artifacts ?? base.artifacts,
    workflow: workflow ?? base.workflow,
  }
}

/**
 * Builds a partial policy overlay containing only flags the user supplied.
 *
 * @param artifacts - Explicit artifact flag, when supplied
 * @param workflow - Explicit workflow flag, when supplied
 * @returns The overlay, or `undefined` when neither flag was supplied
 */
export function resolveInvalidationOverride(
  artifacts: ArtifactPolicyFlag | undefined,
  workflow: WorkflowPolicyFlag | undefined,
): InvalidationPolicyFlagOverride | undefined {
  if (artifacts === undefined && workflow === undefined) return undefined
  return {
    ...(artifacts !== undefined ? { artifacts } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
  }
}

/**
 * Reads a structured policy from config without treating a legacy scalar as workflow redesign.
 *
 * @param config - Loaded project config
 * @returns The configured policy, or the native default
 */
function readConfiguredPolicy(config: object): StructuredInvalidationPolicy {
  if (!('invalidation' in config)) return NATIVE_DEFAULT_POLICY
  const value = (config as { invalidation?: unknown }).invalidation
  if (typeof value !== 'object' || value === null) return NATIVE_DEFAULT_POLICY
  const record = value as { artifacts?: unknown; workflow?: unknown }
  const artifacts =
    typeof record.artifacts === 'string' && isArtifactPolicyFlag(record.artifacts)
      ? record.artifacts
      : NATIVE_DEFAULT_POLICY.artifacts
  const workflow =
    typeof record.workflow === 'string' && isWorkflowPolicyFlag(record.workflow)
      ? record.workflow
      : NATIVE_DEFAULT_POLICY.workflow
  return { artifacts, workflow }
}
