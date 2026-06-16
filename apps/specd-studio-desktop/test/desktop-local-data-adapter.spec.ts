import { describe, expect, it } from 'vitest'
import { createDesktopLocalDataAdapter } from '../src/renderer/desktop-local-data-adapter.js'

describe('createDesktopLocalDataAdapter', () => {
  it('normalizes artifact filenames for local IPC reads and saves', async () => {
    const bridge = {
      invoke: (method: string): Promise<unknown> => {
        if (method === 'getChangeArtifact' || method === 'saveChangeArtifact') {
          return Promise.resolve({
            content: '# Tasks\n',
            originalHash: 'sha256:artifact',
          })
        }
        throw new Error(`unexpected method ${method}`)
      },
      ping: () => Promise.resolve({ pong: true }),
      draftAwareMethods: [],
    }

    const adapter = createDesktopLocalDataAdapter(bridge as never)

    await expect(adapter.getChangeArtifact('specd-studio', 'tasks.md')).resolves.toEqual({
      filename: 'tasks.md',
      content: '# Tasks\n',
      originalHash: 'sha256:artifact',
    })

    await expect(
      adapter.saveChangeArtifact('specd-studio', 'tasks.md', {
        filename: 'tasks.md',
        content: '# Tasks\n',
        originalHash: 'sha256:artifact',
      }),
    ).resolves.toEqual({
      filename: 'tasks.md',
      content: '# Tasks\n',
      originalHash: 'sha256:artifact',
    })
  })
})
