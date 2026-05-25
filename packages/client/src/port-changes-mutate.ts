import type { ArtifactContentDto } from './dto/artifact-content.js'
import type { ChangeDetailDto } from './dto/change-detail.js'
import type { ValidateBatchResultDto } from './dto/validate-batch-result.js'
import type { ValidateResultDto } from './dto/validate-result.js'
import type {
  PatchChangeInput,
  SaveChangeArtifactInput,
  TransitionChangeInput,
  ValidateChangeBatchInput,
  ValidateChangeInput,
} from './inputs.js'

/** Mutating change operations (`api:routes-changes-mutate`). */
export interface PortChangesMutate {
  saveChangeArtifact(
    name: string,
    filename: string,
    input: SaveChangeArtifactInput,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>
  validateChange(
    name: string,
    input?: ValidateChangeInput,
    signal?: AbortSignal,
  ): Promise<ValidateResultDto>
  validateChangeAll(
    name: string,
    input?: ValidateChangeBatchInput,
    signal?: AbortSignal,
  ): Promise<ValidateBatchResultDto>
  transitionChange(
    name: string,
    input: TransitionChangeInput,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto>
  patchChange(
    name: string,
    input: PatchChangeInput,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto>
  draftChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  restoreChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  discardChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  archiveChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  approveSpec(name: string, specId: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  approveSignoff(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  invalidateChange(name: string, signal?: AbortSignal): Promise<ChangeDetailDto>
  skipArtifact(
    name: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto>
  updateSpecDependencies(
    name: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto>
  updateImplementationTracking(
    name: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ChangeDetailDto>
}
