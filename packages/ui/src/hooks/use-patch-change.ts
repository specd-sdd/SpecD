import type { ChangeDetailDto, PatchChangeInput } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'

/**
 * PATCH `/changes/{name}` for metadata edits (description, scope, policy).
 */
export function usePatchChange(onPatched?: (detail: ChangeDetailDto) => void): {
  patch: (changeName: string, input: PatchChangeInput) => Promise<ChangeDetailDto | undefined>
  isPatching: boolean
  error: Error | undefined
  clearError: () => void
} {
  const port = useSpecdDataPort()
  const [isPatching, setIsPatching] = React.useState(false)
  const [error, setError] = React.useState<Error | undefined>()

  const patch = React.useCallback(
    async (changeName: string, input: PatchChangeInput): Promise<ChangeDetailDto | undefined> => {
      setIsPatching(true)
      setError(undefined)
      try {
        const detail = await port.patchChange(changeName, input)
        onPatched?.(detail)
        return detail
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return undefined
      } finally {
        setIsPatching(false)
      }
    },
    [port, onPatched],
  )

  const clearError = React.useCallback(() => setError(undefined), [])

  return { patch, isPatching, error, clearError }
}
