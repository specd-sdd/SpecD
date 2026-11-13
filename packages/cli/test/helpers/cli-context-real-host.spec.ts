import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '@specd/sdk'
import { writeRealProject } from './real-project.js'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { resetCliCleanupForTests, runCliCleanup } from '../../src/helpers/cli-cleanup.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  resetCliCleanupForTests()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('resolveCliContext with a real host', () => {
  it('delivers a log entry emitted through the kernel logger to the onLog callback', async () => {
    const configPath = await writeRealProject(tempDirs)
    const onLog = vi.fn<(entry: { message: string }) => void>()

    const context = await resolveCliContext({ configPath, onLog, plugins: false })
    try {
      expect(context.kernel).toBeDefined()
      Logger.info('hello from the kernel logger')

      await vi.waitFor(() => expect(onLog).toHaveBeenCalled())
      expect(onLog.mock.calls.map(([entry]) => entry.message)).toContain(
        'hello from the kernel logger',
      )
    } finally {
      await runCliCleanup()
    }
  })

  it('disposes a real kernel twice without failing', async () => {
    const configPath = await writeRealProject(tempDirs)

    const context = await resolveCliContext({ configPath, plugins: false })
    try {
      await context.kernel.dispose()
      await expect(context.kernel.dispose()).resolves.toBeUndefined()
    } finally {
      await runCliCleanup()
    }
  })
})
