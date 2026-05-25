import * as React from 'react'
import type { ArtifactContentDto } from '@specd/client'
import { ArtifactConflictError } from '@specd/client'
import { useSpecdDataPort } from '../context/specd-data-context.js'

export type ConflictState = {
  readonly localContent: string
  readonly serverHash: string | undefined
  readonly error: ArtifactConflictError
}

export type InspectorSaveResult = ArtifactContentDto

/**
 * Save hook for change artifact editor.
 *
 * - Calls `saveChangeArtifact` with `content` + `originalHash`.
 * - On HTTP 409 surfaces a `conflict` state instead of throwing silently.
 * - On success signals the caller via `onSaved(newDto)` so callers can
 *   update their `originalHash` reference and trigger any needed refetch.
 */
export function useInspectorSave(
  changeName: string | undefined,
  filename: string | undefined,
  onSaved?: (dto: InspectorSaveResult) => void,
): {
  save: (
    content: string,
    originalHash: string,
    force?: boolean,
  ) => Promise<InspectorSaveResult | undefined>
  forceOverwrite: (
    content: string,
    originalHash: string,
  ) => Promise<InspectorSaveResult | undefined>
  isSaving: boolean
  conflict: ConflictState | undefined
  clearConflict: () => void
} {
  const port = useSpecdDataPort()
  const [isSaving, setIsSaving] = React.useState(false)
  const [conflict, setConflict] = React.useState<ConflictState | undefined>()

  const save = React.useCallback(
    async (
      content: string,
      originalHash: string,
      force = false,
    ): Promise<InspectorSaveResult | undefined> => {
      if (!changeName || !filename) return undefined
      setIsSaving(true)
      setConflict(undefined)
      try {
        const result = await port.saveChangeArtifact(changeName, filename, {
          content,
          originalHash,
          ...(force ? { force } : {}),
        })
        onSaved?.(result)
        return result
      } catch (err) {
        if (err instanceof ArtifactConflictError) {
          setConflict({ localContent: content, serverHash: err.serverHash, error: err })
          return undefined
        }
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [port, changeName, filename, onSaved],
  )

  /** Force-overwrite after user confirms conflict resolution. */
  const forceOverwrite = React.useCallback(
    async (content: string, originalHash: string): Promise<InspectorSaveResult | undefined> => {
      return save(content, originalHash, true)
    },
    [save],
  )

  const clearConflict = React.useCallback(() => setConflict(undefined), [])

  return { save, forceOverwrite, isSaving, conflict, clearConflict }
}
