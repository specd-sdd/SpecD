import { deriveSpecIdFromFilename } from '../hooks/use-change-preview.js'
import { sortSpecIds } from './sort-spec-ids.js'

export interface ArtifactFileItem {
  readonly filename: string
  readonly state: string
  readonly displayStatus: string
}

/** Spec-scoped files merged across artifact types for one specId. */
export interface ArtifactSpecGroup {
  readonly specId: string
  readonly files: readonly ArtifactFileItem[]
}

/** Change-scoped files for one artifact type (DAG step, listed once). */
export interface ArtifactTypeGroup {
  readonly type: string
  readonly files: readonly ArtifactFileItem[]
}

export type ArtifactScopeKind = 'change' | 'spec'

export interface ArtifactScopeGroup {
  readonly scope: ArtifactScopeKind
  readonly typeGroups?: readonly ArtifactTypeGroup[]
  readonly specGroups?: readonly ArtifactSpecGroup[]
}

/** schema-std artifact DAG topological order (declaration + requires). */
export const SCHEMA_ARTIFACT_DAG_ORDER = ['proposal', 'specs', 'verify', 'design', 'tasks'] as const

const CHANGE_SCOPED_ARTIFACT_TYPES = new Set<string>(['proposal', 'design', 'tasks'])

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/** spec.md first, then remaining paths ascending. */
export function sortSpecScopedArtifactFiles(
  files: readonly ArtifactFileItem[],
): readonly ArtifactFileItem[] {
  const specMd: ArtifactFileItem[] = []
  const rest: ArtifactFileItem[] = []
  for (const file of files) {
    if (basename(file.filename) === 'spec.md') {
      specMd.push(file)
    } else {
      rest.push(file)
    }
  }
  specMd.sort((a, b) => a.filename.localeCompare(b.filename))
  rest.sort((a, b) => a.filename.localeCompare(b.filename))
  return [...specMd, ...rest]
}

export function artifactScopeGroupFileCount(group: ArtifactScopeGroup): number {
  const typeCount =
    group.typeGroups?.reduce((total, typeGroup) => total + typeGroup.files.length, 0) ?? 0
  const specCount =
    group.specGroups?.reduce((total, specGroup) => total + specGroup.files.length, 0) ?? 0
  return typeCount + specCount
}

export function groupChangeArtifactEntries(
  items: ReadonlyArray<{
    filename: string
    type?: string
    artifactType?: string
    state?: string
    displayStatus?: string
  }>,
): readonly ArtifactScopeGroup[] {
  const changeByType = new Map<string, ArtifactFileItem[]>()
  const specById = new Map<string, ArtifactFileItem[]>()

  for (const item of items) {
    const type = item.type ?? item.artifactType ?? 'unknown'
    const file: ArtifactFileItem = {
      filename: item.filename,
      state: item.state ?? 'unknown',
      displayStatus: item.displayStatus ?? item.state ?? '',
    }
    const specId = deriveSpecIdFromFilename(file.filename)
    if (specId !== undefined) {
      const bucket = specById.get(specId) ?? []
      bucket.push(file)
      specById.set(specId, bucket)
      continue
    }
    const bucket = changeByType.get(type) ?? []
    bucket.push(file)
    changeByType.set(type, bucket)
  }

  const scopeGroups: ArtifactScopeGroup[] = []

  const changeTypeGroups: ArtifactTypeGroup[] = []
  const seenChangeTypes = new Set<string>()
  for (const artifactType of SCHEMA_ARTIFACT_DAG_ORDER) {
    if (!CHANGE_SCOPED_ARTIFACT_TYPES.has(artifactType)) continue
    const files = changeByType.get(artifactType)
    if (files === undefined || files.length === 0) continue
    seenChangeTypes.add(artifactType)
    changeTypeGroups.push({
      type: artifactType,
      files: [...files].sort((a, b) => a.filename.localeCompare(b.filename)),
    })
  }
  for (const [type, files] of changeByType) {
    if (seenChangeTypes.has(type) || files.length === 0) continue
    changeTypeGroups.push({
      type,
      files: [...files].sort((a, b) => a.filename.localeCompare(b.filename)),
    })
  }
  if (changeTypeGroups.length > 0) {
    scopeGroups.push({ scope: 'change', typeGroups: changeTypeGroups })
  }

  if (specById.size > 0) {
    const specGroups = sortSpecIds([...specById.keys()]).map((specId) => ({
      specId,
      files: sortSpecScopedArtifactFiles(specById.get(specId)!),
    }))
    scopeGroups.push({ scope: 'spec', specGroups })
  }

  return scopeGroups
}
