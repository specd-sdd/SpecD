import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

function outlineBasename(filename: string): string {
  const parts = filename.split('/')
  return parts[parts.length - 1] ?? filename
}

function normalizeOutlineRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value as readonly Record<string, unknown>[]
  }
  if (value !== null && typeof value === 'object') {
    return [value as Record<string, unknown>]
  }
  return []
}

export type UseArtifactOutlineParams = {
  readonly enabled: boolean
  readonly kind: 'change' | 'spec' | 'none'
  readonly changeName?: string
  readonly changeFilename?: string
  readonly workspace?: string
  readonly specPath?: string
  /** Workspace artifact basename when outlining a spec artifact file. */
  readonly specArtifactFilename?: string
  /** Current editor buffer (saved or draft). */
  readonly content?: string
  readonly refreshKey?: number
}

/**
 * Loads navigable outline for a change or workspace artifact.
 * Uses draft POST endpoints when `content` differs from saved (caller passes current buffer).
 */
export function useArtifactOutline(
  params: UseArtifactOutlineParams,
): ReturnType<typeof useAsyncResource<readonly Record<string, unknown>[]>> {
  const port = useSpecdDataPort()
  const {
    enabled,
    kind,
    changeName,
    changeFilename,
    workspace,
    specPath,
    specArtifactFilename,
    content,
    refreshKey,
  } = params

  const load = React.useCallback(async () => {
    if (kind === 'change' && changeName && changeFilename) {
      const rows = await port.outlineChangeArtifact(changeName, changeFilename, {
        ...(content !== undefined ? { content } : {}),
      })
      return normalizeOutlineRows(rows)
    }
    if (kind === 'spec' && workspace && specPath) {
      const filename = specArtifactFilename ?? 'spec.md'
      const rows =
        content !== undefined
          ? await port.outlineSpecDraft(workspace, specPath, {
              filename,
              content,
            })
          : await port.getSpecOutline(workspace, specPath, { filename })
      return normalizeOutlineRows(rows)
    }
    return []
  }, [port, kind, changeName, changeFilename, workspace, specPath, specArtifactFilename, content])

  const key =
    kind === 'change'
      ? `outline:change:${changeName}:${changeFilename}:${content?.length ?? 0}`
      : kind === 'spec'
        ? `outline:spec:${workspace}:${specPath}:${outlineBasename(specArtifactFilename ?? 'spec.md')}:${content?.length ?? 0}`
        : 'outline:none'

  return useAsyncResource(key, load, {
    enabled: enabled && kind !== 'none',
    refreshKey,
    keepPreviousWhileLoading: true,
  })
}
