import * as React from 'react'

/**
 * Freezes `refreshKey` while a tab/panel is hidden so global poll does not refetch.
 * When the tab becomes visible again, adopts the latest `refreshKey` (immediate catch-up).
 */
export function useTabScopedPollKey(tabActive: boolean, refreshKey: number): number {
  const frozen = React.useRef(refreshKey)
  if (tabActive) {
    frozen.current = refreshKey
  }
  return frozen.current
}
