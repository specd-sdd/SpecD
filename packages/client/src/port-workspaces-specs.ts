import type { ArtifactContentDto } from './dto/artifact-content.js'
import type { SpecDetailDto } from './dto/spec-detail.js'
import type { SpecContextDto } from './dto/spec-context.js'
import type { SpecSummaryDto } from './dto/spec-summary.js'
import type { WorkspaceSpecTreeDto } from './dto/workspace-spec-tree.js'
import type { WorkspaceSummaryDto } from './dto/project.js'
import type { WorkspaceSpecsValidateResultDto } from './dto/workspace-specs-validate-result.js'
import type { OutlineSpecDraftInput } from './inputs.js'

/** Workspace and canonical spec operations (`api:routes-workspaces`). */
export interface PortWorkspacesSpecs {
  listWorkspaces(signal?: AbortSignal): Promise<readonly WorkspaceSummaryDto[]>
  listSpecs(workspace: string, signal?: AbortSignal): Promise<WorkspaceSpecTreeDto>
  getSpec(workspace: string, specPath: string, signal?: AbortSignal): Promise<SpecDetailDto>
  getSpecOutline(
    workspace: string,
    specPath: string,
    query?: { readonly filename?: string; readonly signal?: AbortSignal },
  ): Promise<readonly Record<string, unknown>[]>
  outlineSpecDraft(
    workspace: string,
    specPath: string,
    input: OutlineSpecDraftInput,
  ): Promise<readonly Record<string, unknown>[]>
  getSpecContext(
    workspace: string,
    specPath: string,
    query?: { readonly signal?: AbortSignal },
  ): Promise<SpecContextDto>
  getSpecArtifact(
    workspace: string,
    specPath: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<ArtifactContentDto>
  validateSpecs(
    workspace: string,
    specPath?: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceSpecsValidateResultDto>
  searchSpecs(query: {
    readonly q: string
    readonly workspace?: string
    readonly signal?: AbortSignal
  }): Promise<readonly SpecSummaryDto[]>
}
