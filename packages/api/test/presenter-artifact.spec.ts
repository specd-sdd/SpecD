import { describe, expect, it } from 'vitest'
import {
  toArtifactContentDto,
  toSaveArtifactContentDto,
} from '../src/delivery/http/presenters/presenter-artifact.js'

describe('presenter-artifact', () => {
  it('includes filename for read artifact dto', () => {
    expect(
      toArtifactContentDto('tasks.md', {
        content: '# Tasks\n',
        originalHash: 'sha256:read',
      }),
    ).toEqual({
      filename: 'tasks.md',
      content: '# Tasks\n',
      originalHash: 'sha256:read',
    })
  })

  it('includes filename for save artifact dto', () => {
    expect(
      toSaveArtifactContentDto('tasks.md', '# Tasks\n', {
        contentHash: 'sha256:save',
        updatedAt: '2026-06-14T10:00:00.000Z',
        invalidated: false,
      }),
    ).toEqual({
      filename: 'tasks.md',
      content: '# Tasks\n',
      originalHash: 'sha256:save',
      contentHash: 'sha256:save',
      updatedAt: '2026-06-14T10:00:00.000Z',
    })
  })
})
