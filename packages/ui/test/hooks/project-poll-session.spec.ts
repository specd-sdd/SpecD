import { describe, expect, it } from 'vitest'
import {
  publishProjectPollSession,
  readProjectPollSessionSnapshotForTests,
  resetProjectPollSessionForTests,
} from '../../src/hooks/project-poll-session.js'

describe('project poll session store', () => {
  it('publishes snapshot for subscribers', () => {
    resetProjectPollSessionForTests()
    publishProjectPollSession({
      project: undefined,
      projectStatus: {
        activeChanges: 0,
        drafts: 0,
        discarded: 0,
        archived: 0,
        graph: {
          stale: true,
          warnings: [{ type: 'graph-stale', message: 'stale msg' }],
        },
        auth: { type: 'disabled' },
      },
      refreshKey: 1,
      isLoading: false,
      error: undefined,
    })

    const snapshot = readProjectPollSessionSnapshotForTests()
    expect(snapshot.projectStatus?.graph?.warnings).toEqual([
      { type: 'graph-stale', message: 'stale msg' },
    ])
  })
})
