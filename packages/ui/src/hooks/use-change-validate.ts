import type {
  SpecdDataPort,
  ValidateBatchResultDto,
  ValidateChangeInput,
  ValidateResultDto,
} from '@specd/client'
import { deriveSpecIdFromFilename } from './use-change-preview.js'

/**
 * Maps a change-directory filename to a schema artifact id (`specs`, `verify`, `proposal`, …).
 */
export function deriveArtifactIdFromFilename(filename: string): string | undefined {
  const leaf = filename.split('/').pop() ?? filename

  if (/\.delta\.ya?ml$/i.test(leaf)) {
    if (leaf.startsWith('spec.')) return 'specs'
    if (leaf.startsWith('verify.')) return 'verify'
    return undefined
  }

  if (filename.startsWith('specs/')) {
    if (leaf === 'spec.md') return 'specs'
    if (leaf === 'verify.md') return 'verify'
    return undefined
  }

  if (!filename.includes('/')) {
    const match = /^([a-z0-9-]+)\.[^.]+$/i.exec(leaf)
    if (match) return match[1]
  }

  return undefined
}

/**
 * Flattens a DAG batch result into the legacy single-result shape used by the Problems panel.
 */
export function flattenBatchValidateResult(batch: ValidateBatchResultDto): ValidateResultDto {
  const failures: ValidateResultDto['failures'][number][] = []
  const warnings: string[] = []
  const files: string[] = []
  for (const step of batch.results) {
    failures.push(...(step.failures ?? []))
    warnings.push(...(step.warnings ?? []))
    files.push(...(step.files ?? []))
  }
  return {
    passed: batch.passed,
    failures,
    warnings,
    files,
  }
}

/**
 * Validates the open artifact (single schema step) or the full change via DAG batch
 * (`validate-all`, parity with CLI `change validate --all`).
 */
export async function runChangeValidation(
  port: SpecdDataPort,
  changeName: string,
  options: {
    readonly filename?: string
    readonly artifactId?: string
  },
): Promise<ValidateResultDto> {
  const { filename, artifactId } = options

  if (filename !== undefined) {
    const derivedArtifactId = deriveArtifactIdFromFilename(filename)
    const specId = deriveSpecIdFromFilename(filename)
    const input: ValidateChangeInput = {
      ...(specId !== undefined ? { specId } : {}),
      ...(derivedArtifactId !== undefined ? { artifactId: derivedArtifactId } : {}),
    }
    return port.validateChange(changeName, input)
  }

  const batch = await port.validateChangeAll(
    changeName,
    artifactId !== undefined ? { artifactId } : {},
  )
  return flattenBatchValidateResult(batch)
}

export type ValidateConfirmScope = 'artifact' | 'all'

/**
 * Copy for the pre-validate confirmation modal (drift / DAG invalidation warning).
 */
export function buildValidateConfirmMessage(
  scope: ValidateConfirmScope,
  changeName: string,
  filename?: string,
): string {
  const target =
    scope === 'all'
      ? `all specs in change "${changeName}"`
      : filename !== undefined
        ? `artifact "${filename}" in change "${changeName}"`
        : `the open artifact in change "${changeName}"`

  return (
    `Validation will re-run schema checks for ${target}.\n\n` +
    'If any artifact was already validated or the change was approved, content that no longer matches ' +
    'the recorded hashes can invalidate the change and mark downstream steps in the artifact DAG as needing review (drift).\n\n' +
    'Continue?'
  )
}

/** Shown after validate — approval drift may invalidate downstream DAG steps. */
export const VALIDATE_INVALIDATION_NOTE =
  'Note: validation compares content hashes to approvals; drift may invalidate downstream artifacts in the change DAG (see Overview / status).'
