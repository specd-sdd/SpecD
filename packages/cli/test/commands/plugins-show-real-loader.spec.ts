import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockHost,
  makeProgram,
  mockProcessExit,
} from './helpers.js'
import { writeProjectWithPluginSource } from './plugins-real-loader-fixtures.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsShow } from '../../src/commands/plugins/show.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const CASES: ReadonlyArray<{
  label: string
  name: string
  source: string
  capabilities: string[] | undefined
}> = [
  {
    label: 'hook-only (install and uninstall hooks, no agents)',
    name: '@acme/both',
    source:
      'export function create() { return { name: "@acme/both", version: "1.0.0", init() {}, destroy() {}, install() {}, uninstall() {} } }\n',
    capabilities: ['install', 'uninstall'],
  },
  {
    label: 'install-only',
    name: '@acme/install-only',
    source:
      'export function create() { return { name: "@acme/install-only", version: "1.0.0", init() {}, destroy() {}, install() {} } }\n',
    capabilities: ['install'],
  },
  {
    label: 'uninstall-only',
    name: '@acme/uninstall-only',
    source:
      'export function create() { return { name: "@acme/uninstall-only", version: "1.0.0", init() {}, destroy() {}, uninstall() {} } }\n',
    capabilities: ['uninstall'],
  },
  {
    label: 'no hooks and no agents',
    name: '@acme/plain',
    source:
      'export function create() { return { name: "@acme/plain", version: "1.0.0", init() {}, destroy() {} } }\n',
    capabilities: undefined,
  },
]

/**
 * Runs `plugins show` against a real package on disk.
 *
 * @param name - Plugin package name
 * @param source - Plugin entry module source
 * @param format - Output format
 * @returns Captured stdout
 */
async function runShow(name: string, source: string, format: 'text' | 'json'): Promise<string> {
  const projectRoot = await writeProjectWithPluginSource(tempDirs, name, source)
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: makeMockConfig({ projectRoot }),
      configFilePath: join(projectRoot, 'specd.yaml'),
    }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  const program = makeProgram()
  registerPluginsShow(program.command('plugins'))
  await program
    .parseAsync(['node', 'specd', 'plugins', 'show', name, '--format', format])
    .catch((error: unknown) => {
      throw new Error(`show failed: ${stderr()} ${String(error)}`)
    })
  return stdout()
}

describe('plugins show capabilities with the real plugin loader', () => {
  for (const testCase of CASES) {
    it(`reports capabilities in JSON for a ${testCase.label} plugin`, async () => {
      const parsed = JSON.parse(await runShow(testCase.name, testCase.source, 'json'))
      if (testCase.capabilities === undefined) {
        expect(parsed).not.toHaveProperty('capabilities')
      } else {
        expect(parsed.capabilities).toEqual(testCase.capabilities)
      }
    })

    it(`reports capabilities in text for a ${testCase.label} plugin`, async () => {
      const text = await runShow(testCase.name, testCase.source, 'text')
      if (testCase.capabilities === undefined) {
        expect(text).not.toContain('capabilities:')
      } else {
        expect(text).toContain(`capabilities: ${testCase.capabilities.join(', ')}`)
      }
    })
  }
})
