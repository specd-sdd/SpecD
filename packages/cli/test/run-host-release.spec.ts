import { afterEach, describe, expect, it, vi } from 'vitest'

const parseAsync = vi.hoisted(() => vi.fn())

vi.mock('../src/program.js', () => ({ createProgram: () => ({ parseAsync }) }))
vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  openSpecdHost: vi.fn(),
}))

import { openSpecdHost } from '@specd/sdk'
import { openCliHost } from '../src/helpers/cli-host.js'
import { resetCliCleanupForTests } from '../src/helpers/cli-cleanup.js'
import { run } from '../src/run.js'
import { makeMockHost } from './commands/helpers.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetCliCleanupForTests()
})

describe('run releases hosts opened by commands', () => {
  it('disposes a host whose command never calls dispose', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const host = makeMockHost()
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    parseAsync.mockImplementation(async () => {
      await openCliHost({ configPath: '/project/specd.yaml' })
    })

    await run(['node', 'specd', 'x'])

    expect(host.dispose).toHaveBeenCalledTimes(1)
  })
})
