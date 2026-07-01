import type { ProjectDto, ProjectStatusDto } from '@specd/client'
import * as React from 'react'

export type ProjectPollSessionSnapshot = {
  readonly project: ProjectDto | undefined
  readonly projectStatus: ProjectStatusDto | undefined
  readonly refreshKey: number
  readonly isLoading: boolean
  readonly error: Error | undefined
  readonly refetch: () => void
}

const EMPTY_SNAPSHOT: ProjectPollSessionSnapshot = {
  project: undefined,
  projectStatus: undefined,
  refreshKey: 0,
  isLoading: false,
  error: undefined,
  refetch: () => undefined,
}

let sessionSnapshot: ProjectPollSessionSnapshot = EMPTY_SNAPSHOT
const sessionListeners = new Set<() => void>()

function subscribeProjectPollSession(listener: () => void): () => void {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

function getProjectPollSessionSnapshot(): ProjectPollSessionSnapshot {
  return sessionSnapshot
}

/**
 * Publishes the latest global project poll snapshot for cross-shell subscribers.
 */
export function publishProjectPollSession(
  snapshot: Omit<ProjectPollSessionSnapshot, 'refetch'> & { readonly refetch?: () => void },
): void {
  sessionSnapshot = {
    ...snapshot,
    refetch: snapshot.refetch ?? sessionSnapshot.refetch,
  }
  for (const listener of sessionListeners) {
    listener()
  }
}

/** Reads the shared project poll session snapshot. */
export function useProjectPollSession(): ProjectPollSessionSnapshot {
  return React.useSyncExternalStore(
    subscribeProjectPollSession,
    getProjectPollSessionSnapshot,
    getProjectPollSessionSnapshot,
  )
}

/** @internal Resets session state between tests. */
export function resetProjectPollSessionForTests(): void {
  sessionSnapshot = EMPTY_SNAPSHOT
}

/** @internal Reads session snapshot in tests without React. */
export function readProjectPollSessionSnapshotForTests(): ProjectPollSessionSnapshot {
  return sessionSnapshot
}
