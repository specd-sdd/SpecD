import * as React from 'react'

/** Placeholder until workspace/graph hooks are implemented. */
export function useWorkspacesSpecsStub(): {
  isLoading: boolean
  data: { workspaces: string[] }
} {
  return React.useMemo(
    () => ({
      isLoading: false,
      data: { workspaces: [] },
    }),
    [],
  )
}

/**
 *
 */
export function useGraphStatusStub(): {
  isLoading: boolean
  data: undefined
} {
  return { isLoading: false, data: undefined }
}

/**
 *
 */
export function useCommandPaletteStub(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = React.useState(false)
  return { open, setOpen }
}
