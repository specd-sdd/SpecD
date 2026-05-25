import type { PreviewResultFileDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Derive a specId (`workspace:capability-path`) from a change-directory artifact path.
 *
 * Supports new specs and deltas:
 * - `specs/ui/foo/spec.md` → `ui:foo`
 * - `deltas/core/change-manifest/spec.md.delta.yaml` → `core:change-manifest`
 * - `deltas/default/_global/architecture/verify.md.delta.yaml` → `default:_global/architecture`
 */
export function deriveSpecIdFromFilename(filename: string): string | undefined {
  const deltaNested = /^deltas\/([^/]+)\/(.+)\/[^/]+\.delta\.ya?ml$/i.exec(filename)
  if (deltaNested) {
    return `${deltaNested[1]}:${deltaNested[2]}`
  }

  const deltaFlat = /^deltas\/([^/]+)\/[^/]+\.delta\.ya?ml$/i.exec(filename)
  if (deltaFlat) {
    const leaf = basename(filename)
    const cap = leaf.replace(/\.delta\.ya?ml$/i, '')
    return cap.length > 0 ? `${deltaFlat[1]}:${cap}` : deltaFlat[1]
  }

  const specNested = /^specs\/([^/]+)\/(.+)\/[^/]+\.[^/]+$/.exec(filename)
  if (specNested) {
    return `${specNested[1]}:${specNested[2]}`
  }

  const specFlat = /^specs\/([^/]+)\/[^/]+\.[^/]+$/.exec(filename)
  if (specFlat) {
    return specFlat[1]
  }

  return undefined
}

/** True when Preview/Diff should use GET .../preview (spec-preview merge), not raw file bytes. */
export function usesSpecPreview(filename: string): boolean {
  return deriveSpecIdFromFilename(filename) !== undefined
}

/** True when the inspector should offer a Diff tab (delta artifacts on active changes only). */
export function showsInspectorDiffTab(filename: string | undefined): boolean {
  if (filename === undefined || !usesSpecPreview(filename)) {
    return false
  }
  return filename.startsWith('deltas/')
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/**
 * Pick the preview file entry that matches the selected artifact (by leaf name).
 */
/** Map delta path to canonical artifact name returned by spec-preview (e.g. spec.md). */
function previewTargetBasename(artifactFilename: string): string {
  const leaf = basename(artifactFilename)
  if (/\.md\.delta\.ya?ml$/i.test(leaf)) {
    return leaf.replace(/\.delta\.ya?ml$/i, '')
  }
  if (/\.delta\.ya?ml$/i.test(leaf)) {
    return leaf.replace(/\.delta\.ya?ml$/i, '.md')
  }
  return leaf
}

export function pickPreviewFile(
  files: readonly PreviewResultFileDto[],
  artifactFilename: string,
): PreviewResultFileDto | undefined {
  const target = previewTargetBasename(artifactFilename)
  return (
    files.find((f) => f.filename === target) ??
    files.find((f) => basename(f.filename) === target) ??
    files.find((f) => f.filename === basename(artifactFilename)) ??
    files[0]
  )
}

export type ResolvedArtifactPreview = {
  readonly specId: string
  readonly file: PreviewResultFileDto
  /** Merged content from `changes spec-preview` / GET .../preview (delta applied to base). */
  readonly merged: string
  /** Canonical base before delta; undefined for new specs. */
  readonly base: string | undefined
  readonly hasDiff: boolean
}

export type UseChangePreviewOptions = {
  /** When false, no network call (e.g. inspector on Edit tab). */
  readonly enabled?: boolean
  /** Unsaved change-directory overrides (filename → content). */
  readonly artifactOverrides?: Readonly<Record<string, string>>
}

/**
 * Fetches spec-preview merge result for a spec-scoped change artifact.
 * Does not follow global shell polling — call `refetch()` after save if needed.
 */
export function useChangePreview(
  changeName: string | undefined,
  filename: string | undefined,
  options: UseChangePreviewOptions = {},
): ReturnType<typeof useAsyncResource<ResolvedArtifactPreview | undefined>> {
  const port = useSpecdDataPort()
  const userEnabled = options.enabled ?? true

  const specId = React.useMemo(
    () => (filename ? deriveSpecIdFromFilename(filename) : undefined),
    [filename],
  )

  const load = React.useCallback(async () => {
    const dto =
      options.artifactOverrides !== undefined
        ? await port.previewChangeDraft(changeName!, {
            specId: specId!,
            artifactOverrides: options.artifactOverrides,
          })
        : await port.previewChange(changeName!, { specId: specId! })
    const file = pickPreviewFile(dto.files, filename!)
    if (!file || file.merged === undefined) {
      return undefined
    }
    const base = file.base
    return {
      specId: dto.specId,
      file,
      merged: file.merged,
      base,
      hasDiff: base !== undefined && base !== file.merged,
    }
  }, [port, changeName, specId, filename, options.artifactOverrides])

  const draftMarker = options.artifactOverrides
    ? Object.entries(options.artifactOverrides)
        .map(([k, v]) => `${k}:${v.length}`)
        .join('|')
    : 'saved'

  return useAsyncResource(
    `change-preview:${changeName ?? ''}:${filename ?? ''}:${draftMarker}`,
    load,
    {
      enabled: userEnabled && Boolean(changeName && filename && specId),
      keepPreviousWhileLoading: true,
    },
  )
}
