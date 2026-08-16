import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { makeProgram } from './helpers.js'
import { registerChangeImplementation } from '../../src/commands/change/implementation.js'
import { registerChangeStatus } from '../../src/commands/change/status.js'

const CHANGE_NAME = 'review-projection'
const CHANGE_DIR = '20260729-120000-review-projection'
type StdoutWriteSpy = MockInstance<typeof process.stdout.write>

describe('implementation review CLI integration', () => {
  let projectRoot: string | undefined

  afterEach(() => {
    vi.restoreAllMocks()
    if (projectRoot !== undefined) {
      rmSync(projectRoot, { recursive: true, force: true })
      projectRoot = undefined
    }
  })

  it('returns one immutable SDK-reviewed projection from list, review, and status', async () => {
    projectRoot = createProjectFixture()
    const configPath = join(projectRoot, 'specd.yaml')
    const manifestPath = join(projectRoot, '.specd', 'changes', CHANGE_DIR, 'manifest.json')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    // Let Core materialize the schema's artifact inventory before the immutable read check.
    await runStatusCommand(configPath, stdout)
    const trackingBefore = readStoredTracking(manifestPath)
    const list = await runImplementationCommand('list', configPath, stdout)
    const review = await runImplementationCommand('review', configPath, stdout)
    const status = await runStatusCommand(configPath, stdout)

    expect(projectProjection(list)).toEqual(projectProjection(review))
    expect(projectProjection(list)).toEqual(projectProjection(status.implementationTracking))
    expect(projectProjection(list).links[0]?.symbolResolutions).toEqual([
      expect.objectContaining({
        symbol: 'MissingSymbol',
        resolution: expect.objectContaining({
          status: 'unresolved',
          target: null,
          candidates: [],
        }),
      }),
    ])
    expect(readStoredTracking(manifestPath)).toEqual(trackingBefore)
  }, 120_000)
})

function createProjectFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'specd-review-cli-int-'))
  const changePath = join(root, '.specd', 'changes', CHANGE_DIR)
  for (const path of [
    join(root, 'specs'),
    join(root, 'src'),
    changePath,
    join(root, '.specd', 'drafts'),
    join(root, '.specd', 'discarded'),
    join(root, '.specd', 'archive'),
  ]) {
    mkdirSync(path, { recursive: true })
  }

  writeFileSync(
    join(root, 'specd.yaml'),
    [
      "schema: '@specd/schema-std'",
      'workspaces:',
      '  default:',
      '    specs:',
      '      adapter:',
      '        type: fs',
      '        config:',
      '          path: specs',
      '    codeRoot: .',
      '    ownership: owned',
      'storage:',
      '  changes:',
      '    adapter:',
      '      type: fs',
      '      config:',
      '        path: .specd/changes',
      '  drafts:',
      '    adapter:',
      '      type: fs',
      '      config:',
      '        path: .specd/drafts',
      '  discarded:',
      '    adapter:',
      '      type: fs',
      '      config:',
      '        path: .specd/discarded',
      '  archive:',
      '    adapter:',
      '      type: fs',
      '      config:',
      '        path: .specd/archive',
      '',
    ].join('\n'),
  )
  writeFileSync(join(root, 'src', 'subject.ts'), 'export const ExistingSymbol = true\n')
  writeFileSync(
    join(changePath, 'manifest.json'),
    `${JSON.stringify(
      {
        name: CHANGE_NAME,
        createdAt: '2026-07-29T12:00:00.000Z',
        updatedAt: '2026-07-29T12:00:00.000Z',
        description: 'Integration fixture for stable implementation review.',
        schema: { name: '@specd/schema-std', version: 1 },
        specIds: ['default:subject'],
        invalidationPolicy: 'downstream',
        trackedImplementationFiles: [{ file: 'src/subject.ts', state: 'resolved' }],
        implementationLinks: [
          {
            specId: 'default:subject',
            file: 'src/subject.ts',
            fileLinkExplicit: false,
            symbols: ['MissingSymbol'],
          },
        ],
        artifacts: [],
        history: [
          {
            type: 'created',
            at: '2026-07-29T12:00:00.000Z',
            by: { name: 'Test', email: 'test@example.com', provider: 'system' },
            specIds: ['default:subject'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  return root
}

async function runImplementationCommand(
  action: 'list' | 'review',
  configPath: string,
  stdout: StdoutWriteSpy,
): Promise<Record<string, unknown>> {
  const start = stdout.mock.calls.length
  const program = makeProgram()
  registerChangeImplementation(program.command('change'))
  await program.parseAsync([
    'node',
    'specd',
    'change',
    'implementation',
    action,
    CHANGE_NAME,
    '--config',
    configPath,
    '--format',
    'json',
  ])
  return parseOutput(stdout, start)
}

async function runStatusCommand(
  configPath: string,
  stdout: StdoutWriteSpy,
): Promise<Record<string, unknown>> {
  const start = stdout.mock.calls.length
  const program = makeProgram()
  registerChangeStatus(program.command('change'))
  await program.parseAsync([
    'node',
    'specd',
    'change',
    'status',
    CHANGE_NAME,
    '--implementation',
    '--config',
    configPath,
    '--format',
    'json',
  ])
  return parseOutput(stdout, start)
}

function parseOutput(stdout: StdoutWriteSpy, start: number): Record<string, unknown> {
  return JSON.parse(
    stdout.mock.calls
      .slice(start)
      .map(([chunk]) => String(chunk))
      .join(''),
  ) as Record<string, unknown>
}

function projectProjection(value: unknown): {
  readonly trackedFiles: unknown
  readonly links: Array<{ readonly symbolResolutions?: unknown }>
  readonly graphHealth: unknown
  readonly graphHint: unknown
} {
  const projection = value as {
    trackedFiles: unknown
    links: Array<{ symbolResolutions?: unknown }>
    graphHealth: unknown
    graphHint: unknown
  }
  return {
    trackedFiles: projection.trackedFiles,
    links: projection.links,
    graphHealth: projection.graphHealth,
    graphHint: projection.graphHint,
  }
}

function readStoredTracking(path: string): {
  readonly trackedImplementationFiles: unknown
  readonly implementationLinks: unknown
} {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    trackedImplementationFiles: unknown
    implementationLinks: unknown
  }
  return {
    trackedImplementationFiles: manifest.trackedImplementationFiles,
    implementationLinks: manifest.implementationLinks,
  }
}
