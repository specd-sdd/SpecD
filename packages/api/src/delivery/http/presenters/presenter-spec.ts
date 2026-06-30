import { type SpecListEntry } from '@specd/sdk'
import { type SpecDetailDto } from '../dto/spec-detail.js'
import { type SpecSummaryDto } from '../dto/spec-summary.js'
import { type WorkspaceSpecTreeDto } from '../dto/workspace-spec-tree.js'

/**
 * Maps spec list entry to summary DTO.
 * @param spec
 */
export function toSpecSummaryDto(spec: SpecListEntry): SpecSummaryDto {
  return {
    specId: `${spec.workspace}:${spec.path}`,
    workspace: spec.workspace,
    path: spec.path,
    title: spec.title,
    ...(spec.summary !== undefined ? { description: spec.summary } : {}),
  }
}

/**
 * Maps spec detail with linked changes.
 * @param spec
 * @param spec.specId
 * @param spec.workspace
 * @param spec.path
 * @param spec.title
 * @param spec.description
 * @param spec.dependsOn
 * @param spec.artifacts
 * @param linkedChanges
 */
export function toSpecDetailDto(
  spec: {
    specId: string
    workspace: string
    path: string
    title?: string
    description?: string
    dependsOn: readonly string[]
    artifacts: readonly { filename: string; hash?: string }[]
  },
  linkedChanges: readonly {
    readonly name: string
    readonly description?: string
    readonly state: string
  }[],
): SpecDetailDto {
  return {
    specId: spec.specId,
    workspace: spec.workspace,
    path: spec.path,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    dependsOn: [...spec.dependsOn],
    artifacts: spec.artifacts.map((a) => ({
      filename: a.filename,
      ...(a.hash !== undefined ? { hash: a.hash } : {}),
    })),
    linkedChanges: linkedChanges.map((change) => ({
      name: change.name,
      ...(change.description !== undefined ? { description: change.description } : {}),
      state: change.state,
    })),
  }
}

/**
 * Groups spec summaries into a workspace tree DTO.
 * @param workspace
 * @param specs
 */
export function toWorkspaceSpecTreeDto(
  workspace: string,
  specs: readonly SpecListEntry[],
): WorkspaceSpecTreeDto {
  return {
    workspace,
    specs: specs.map((s) => ({
      specId: `${s.workspace}:${s.path}`,
      path: s.path,
      title: s.title,
    })),
  }
}
