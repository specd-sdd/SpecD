import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { readFile } from 'node:fs/promises'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import {
  ChangeNotFoundError,
  InvalidInputError,
  InvalidSpecIdError,
  ReadOnlyWorkspaceError,
  SpecNotInChangeError,
  WorkspaceNotFoundError,
} from '@specd/sdk'
import { registerChangeEdit } from '../../src/commands/change/edit.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: config,
      configFilePath: null,
      kernel: kernel,
    }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change edit', () => {
  it('rejects an unknown --artifact-policy value with exit 1', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--artifact-policy', 'sugical'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('sugical')
  })

  it('exits 1 when no options provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('updates change with new spec', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    expect(stdout()).toContain('auth/login')
    expect(stdout()).toContain('auth/register')
  })

  it('does not warn merely because spec scope changed', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['auth/register'] }),
      invalidated: true,
      scopeChanged: true,
      validityChanged: false,
      projectionChanges: [],
      automaticReturn: null,
    })
    captureStdout()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stderr()).not.toContain('warning:')
  })

  it('renders blockers and Core-owned next action for a preserved text state', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'implementing' }),
      invalidated: false,
      scopeChanged: true,
      validityChanged: false,
      blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Review changed design artifacts' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'mechanical',
        command: null,
        reason: 'Resolve validity blockers before advancing',
      },
      projectionChanges: [],
      automaticReturn: null,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stderr()).not.toContain('validity changed')
    expect(stdout()).toContain('blockers:')
    expect(stdout()).toContain('ARTIFACT_REVIEW_REQUIRED: Review changed design artifacts')
    expect(stdout()).toContain('target:  implementing')
    expect(stdout()).toContain('command: (none)')
    expect(stdout()).toContain('reason:  Resolve validity blockers before advancing')
  })

  it.each(['json', 'toon'] as const)(
    'keeps scope and validity separate with guidance in %s',
    async (format) => {
      const { kernel, stdout, stderr } = setup()
      kernel.changes.edit.execute.mockResolvedValue({
        change: makeMockChange({ name: 'feat', state: 'implementing' }),
        invalidated: false,
        scopeChanged: true,
        validityChanged: false,
        blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Review artifacts' }],
        nextAction: {
          targetStep: 'implementing',
          actionType: 'mechanical',
          command: null,
          reason: 'Resolve blockers',
        },
        projectionChanges: [],
        automaticReturn: null,
      })

      const program = makeProgram()
      registerChangeEdit(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'edit',
        'feat',
        '--add-spec',
        'auth/register',
        '--format',
        format,
      ])

      expect(stderr()).not.toContain('validity changed')
      const rendered = stdout()
      expect(rendered).toContain('scopeChanged')
      expect(rendered).toContain('validityChanged')
      expect(rendered).toContain('ARTIFACT_REVIEW_REQUIRED')
      expect(rendered).toContain('implementing')
      if (format === 'json') {
        const parsed = JSON.parse(rendered)
        expect(parsed).toMatchObject({
          invalidated: false,
          scopeChanged: true,
          validityChanged: false,
          blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Review artifacts' }],
          nextAction: { targetStep: 'implementing', reason: 'Resolve blockers' },
        })
      }
    },
  )

  describe('blocker projection', () => {
    const skippableBlocker = {
      code: 'OVERLAP_CONFLICT',
      message: 'Spec overlaps with another change',
      label: 'Spec overlap',
      checkId: 'spec.overlap',
      isSkippable: true,
      details: { entries: [] },
      action: { kind: 'refresh-status', params: { changeName: 'feat' } },
    }
    const plainBlocker = { code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Review artifacts' }

    function mockResult(
      kernel: ReturnType<typeof setup>['kernel'],
      intent: 'design' | 'archive' = 'design',
    ) {
      kernel.changes.edit.execute.mockResolvedValue({
        change: makeMockChange({ name: 'feat', state: 'implementing' }),
        invalidated: false,
        scopeChanged: true,
        validityChanged: false,
        blockers: [skippableBlocker, plainBlocker],
        nextAction: {
          targetStep: 'archiving',
          actionType: 'mechanical',
          reason: 'Ready to archive.',
          intent,
        },
        projectionChanges: [],
        automaticReturn: null,
      })
    }

    async function run(format: 'text' | 'json' | 'toon') {
      const program = makeProgram()
      registerChangeEdit(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'edit',
        'feat',
        '--add-spec',
        'auth/register',
        '--format',
        format,
      ])
    }

    it('prints label and bypass lines exactly once in text mode', async () => {
      const { kernel, stdout } = setup()
      mockResult(kernel)
      await run('text')

      const lines = stdout().split('\n')
      const start = lines.indexOf('blockers:')
      expect(start).toBeGreaterThanOrEqual(0)
      expect(lines.slice(start + 1, start + 4)).toEqual([
        '  ! OVERLAP_CONFLICT \u2014 Spec overlap: Spec overlaps with another change',
        '    bypass: --skip-checks spec.overlap',
        '  ! ARTIFACT_REVIEW_REQUIRED: Review artifacts',
      ])
      expect(lines.filter((l) => l.includes('bypass:'))).toHaveLength(1)
    })

    it('appends the overlap bypass suffix only for an archive intent', async () => {
      const first = setup()
      mockResult(first.kernel, 'design')
      await run('text')
      expect(first.stdout()).not.toContain('Use --skip-checks')
      vi.restoreAllMocks()

      const second = setup()
      mockResult(second.kernel, 'archive')
      await run('text')
      expect(second.stdout()).toContain('reason:  Ready to archive. Use --skip-checks spec.overlap')
    })

    it('projects blockers in json without raw isSkippable', async () => {
      const { kernel, stdout } = setup()
      mockResult(kernel)
      await run('json')

      const parsed = JSON.parse(stdout())
      expect(parsed.blockers).toEqual([
        {
          code: 'OVERLAP_CONFLICT',
          message: 'Spec overlaps with another change',
          label: 'Spec overlap',
          checkId: 'spec.overlap',
          details: { entries: [] },
          action: { kind: 'refresh-status', params: { changeName: 'feat' } },
          bypassFlag: '--skip-checks spec.overlap',
        },
        plainBlocker,
      ])
      expect(stdout()).not.toContain('isSkippable')
    })

    it('projects blockers in toon without raw isSkippable', async () => {
      const { kernel, stdout } = setup()
      mockResult(kernel)
      await run('toon')

      const rendered = stdout()
      expect(rendered).toContain('bypassFlag')
      expect(rendered).toContain('--skip-checks spec.overlap')
      expect(rendered).toContain('spec.overlap')
      expect(rendered).toContain('Spec overlap')
      expect(rendered).not.toContain('isSkippable')
    })

    it('exposes the same blocker codes, labels and bypass flags in text, json and toon', async () => {
      const text = setup()
      mockResult(text.kernel)
      await run('text')
      const textOut = text.stdout()
      vi.restoreAllMocks()

      const json = setup()
      mockResult(json.kernel)
      await run('json')
      const jsonOut = json.stdout()
      vi.restoreAllMocks()

      const toon = setup()
      mockResult(toon.kernel)
      await run('toon')
      const toonOut = toon.stdout()

      const parsed = JSON.parse(jsonOut) as {
        blockers: { code: string; label?: string; bypassFlag?: string }[]
      }
      expect(parsed.blockers.map((b) => b.code)).toEqual([
        'OVERLAP_CONFLICT',
        'ARTIFACT_REVIEW_REQUIRED',
      ])
      for (const blocker of parsed.blockers) {
        expect(textOut).toContain(blocker.code)
        expect(toonOut).toContain(blocker.code)
        if (blocker.label !== undefined) {
          expect(textOut).toContain(blocker.label)
          expect(toonOut).toContain(blocker.label)
        }
        if (blocker.bypassFlag !== undefined) {
          expect(textOut).toContain(`bypass: ${blocker.bypassFlag}`)
          expect(toonOut).toContain(blocker.bypassFlag)
        }
      }
      expect(parsed.blockers.filter((b) => b.bypassFlag !== undefined)).toHaveLength(1)
      for (const out of [textOut, jsonOut, toonOut]) expect(out).not.toContain('isSkippable')
    })
  })

  it('prints the guidance line before reason when the next action has no command', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'implementing' }),
      invalidated: false,
      scopeChanged: true,
      validityChanged: false,
      blockers: [],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'mechanical',
        reason: 'Resolve the custom check',
        intent: null,
        action: { kind: 'custom-plugin-kind', guidance: 'Run the plugin remediation' },
      },
      projectionChanges: [],
      automaticReturn: null,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    const lines = stdout().split('\n')
    const command = lines.indexOf('  command: (none)')
    expect(command).toBeGreaterThanOrEqual(0)
    expect(lines.slice(command + 1, command + 3)).toEqual([
      '  guidance: Run the plugin remediation',
      '  reason:  Resolve the custom check',
    ])
  })

  it.each(['json', 'toon'] as const)(
    'keeps nextAction.guidance in %s output when the next action has no command',
    async (format) => {
      const { kernel, stdout } = setup()
      kernel.changes.edit.execute.mockResolvedValue({
        change: makeMockChange({ name: 'feat', state: 'implementing' }),
        invalidated: false,
        scopeChanged: true,
        validityChanged: false,
        blockers: [],
        nextAction: {
          targetStep: 'implementing',
          actionType: 'mechanical',
          reason: 'Resolve the custom check',
          intent: null,
          action: { kind: 'custom-plugin-kind', guidance: 'Run the plugin remediation' },
        },
        projectionChanges: [],
        automaticReturn: null,
      })

      const program = makeProgram()
      registerChangeEdit(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'edit',
        'feat',
        '--add-spec',
        'auth/register',
        '--format',
        format,
      ])

      const rendered = stdout()
      expect(rendered).toContain('Run the plugin remediation')
      if (format === 'json') {
        const parsed = JSON.parse(rendered)
        expect(parsed.nextAction.command).toBeNull()
        expect(parsed.nextAction.guidance).toBe('Run the plugin remediation')
      } else {
        expect(rendered).toMatch(/guidance:\s*Run the plugin remediation/)
      }
    },
  )

  it('outputs JSON with invalidated flag', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      invalidated: true,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.invalidated).toBe(true)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'missing', '--add-spec', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('does not append invalidated event when no active approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    const call = kernel.changes.edit.execute.mock.calls[0]![0]
    expect(call).toBeDefined()
  })

  it('includes specIds, workspaces, and state in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(Array.isArray(parsed.specIds)).toBe(true)
    expect(parsed.specIds).toContain('auth/login')
    expect(parsed.specIds).toContain('auth/register')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.workspaces).toContain('default')
    expect(parsed.state).toBe('designing')
  })

  it('forwards --add-spec raw and maps WorkspaceNotFoundError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(new WorkspaceNotFoundError('unknown-ws'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ addSpecIds: ['unknown-ws:some/path'] }),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('forwards a comma-containing ID as one value', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('auth/a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'auth/a,b'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ addSpecIds: ['auth/a,b'] }),
    )
    expect(stderr()).toMatch(/error:/)
  })

  it('maps ReadOnlyWorkspaceError from the use case', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError(
        'Cannot add --spec "platform:auth/tokens" to change — workspace "platform" is readOnly.',
      ),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'platform:auth/tokens'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
  })

  it('does not import helpers/spec-path', async () => {
    const source = await readFile(
      new URL('../../src/commands/change/edit.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('helpers/spec-path')
  })
})

describe('change edit gaps (audit hardening)', () => {
  it('exits 1 with the quoted value for "Bad Id"', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('Bad Id', 'contains a space'),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'Bad Id'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("'Bad Id'")
  })

  it('quotes the whole value for auth/a,b', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('auth/a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'auth/a,b'])
      .catch(() => {})

    expect(stderr()).toContain("'auth/a,b'")
  })

  it('exits 1 with an error when removing a spec not in the change', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new SpecNotInChangeError('default:auth/missing', 'feat'),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'edit',
        'feat',
        '--remove-spec',
        'default:auth/missing',
      ])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ removeSpecIds: ['default:auth/missing'] }),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('default:auth/missing')
  })

  // The two tests below only check that the CLI renders the `workspaces` returned by core.
  // Deriving/dropping workspaces on --add-spec/--remove-spec is tested in core EditChange tests.
  it('renders the workspaces returned by core in JSON output (workspace added case)', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        specIds: ['default:auth/login', 'billing-ws:billing/invoices'],
        workspaces: ['default', 'billing-ws'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'billing-ws:billing/invoices',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.workspaces).toEqual(['default', 'billing-ws'])
  })

  it('renders the workspaces returned by core in JSON output (workspace dropped case)', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        specIds: ['default:auth/login'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--remove-spec',
      'billing-ws:billing/invoices',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.workspaces).toEqual(['default'])
    expect(parsed.workspaces).not.toContain('billing-ws')
  })

  it('forwards --remove-spec raw', async () => {
    const { kernel } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: [] }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--remove-spec', 'auth/login'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ removeSpecIds: ['auth/login'] }),
    )
  })

  it('reports the usage error before resolving the config', async () => {
    const { stderr } = setup()
    vi.mocked(resolveCliContext).mockReset()
    vi.mocked(resolveCliContext).mockRejectedValue(new Error('config could not be resolved'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('at least one of --add-spec')
    expect(stderr()).not.toContain('config could not be resolved')
  })

  it('does not read SpecdConfig or workspace ownership in the command source', async () => {
    const source = await readFile(
      new URL('../../src/commands/change/edit.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('SpecdConfig')
    expect(source).not.toContain('ownership')
  })

  it('outputs TOON format with --format toon', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['default:auth/login'] }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/login',
      '--format',
      'toon',
    ])

    const out = stdout()
    expect(out).toContain('name: feat')
    expect(out).toContain('default:auth/login')
  })

  it('names the structured policy flags when no edit option is provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(stderr()).toContain('--artifact-policy')
    expect(stderr()).toContain('--workflow-policy')
    expect(stderr()).not.toContain('--invalidation-policy')
  })

  it('passes only the supplied workflow dimension', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['auth/login'], state: 'implementing' }),
      invalidated: false,
      effectivePolicy: { artifacts: 'downstream', workflow: 'redesign' },
      projectionChanges: [],
      automaticReturn: null,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--workflow-policy',
      'redesign',
    ])

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith({
      name: 'feat',
      invalidation: { workflow: 'redesign' },
    })
    expect(stdout()).toContain('workflow:   redesign')
    expect(stdout()).toContain('automatic return: (none)')
  })

  it('renders projection changes and automatic return from core', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['auth/login'], state: 'designing' }),
      invalidated: true,
      effectivePolicy: { artifacts: 'surgical', workflow: 'preserve' },
      projectionChanges: [
        {
          projection: 'specApproval',
          from: 'valid',
          to: 'stale',
          cause: 'scope-change',
          differences: [
            {
              scope: 'artifact',
              key: 'spec:login',
              kind: 'changed',
              expected: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              actual: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            },
          ],
        },
      ],
      automaticReturn: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--artifact-policy',
      'surgical',
      '--format',
      'json',
    ])

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith({
      name: 'feat',
      invalidation: { artifacts: 'surgical' },
    })
    const parsed = JSON.parse(stdout()) as {
      projectionChanges: Array<{ differences: Array<Record<string, string>> }>
      automaticReturn: { to: string }
      state: string
    }
    expect(parsed.state).toBe('designing')
    expect(parsed.automaticReturn.to).toBe('designing')
    expect(parsed.projectionChanges[0]?.differences[0]).toEqual({
      scope: 'artifact',
      key: 'spec:login',
      kind: 'changed',
    })
    expect(stdout()).not.toContain('sha256:')
    expect(stderr()).toContain('validity changed (specApproval)')
    expect(stderr()).toContain('implementing → designing')
  })

  it.each(['text', 'json'] as const)(
    'reports ready with stale approval and no automatic return in %s',
    async (format) => {
      const { kernel, stdout, stderr } = setup()
      kernel.changes.edit.execute.mockResolvedValue({
        change: makeMockChange({ name: 'feat', specIds: ['auth/login'], state: 'ready' }),
        invalidated: true,
        scopeChanged: true,
        validityChanged: true,
        effectivePolicy: { artifacts: 'surgical', workflow: 'preserve' },
        projectionChanges: [
          { projection: 'specApproval', from: 'valid', to: 'stale', cause: 'scope-change' },
        ],
        automaticReturn: null,
      })

      const program = makeProgram()
      registerChangeEdit(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'edit',
        'feat',
        '--add-spec',
        'auth/login',
        '--format',
        format,
      ])

      expect(stderr()).not.toContain('automatic return')
      if (format === 'json') {
        const parsed = JSON.parse(stdout()) as {
          state: string
          automaticReturn: unknown
          projectionChanges: Array<{ projection: string; to: string }>
        }
        expect(parsed.state).toBe('ready')
        expect(parsed.automaticReturn).toBeNull()
        expect(parsed.projectionChanges[0]).toMatchObject({
          projection: 'specApproval',
          to: 'stale',
        })
      } else {
        const out = stdout()
        expect(out).toContain('state:      ready')
        expect(out).toContain('projection: specApproval valid → stale')
        expect(out).toContain('automatic return: (none)')
      }
    },
  )
})

describe('change edit --help schema', () => {
  it('lists every emitted field with a description', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', '--help']).catch(() => {})
    const help = stdout()
    const start = help.indexOf('JSON/TOON output schema')
    expect(start).toBeGreaterThanOrEqual(0)
    const fieldLines = help
      .slice(start)
      .split('\n')
      .filter((line) => /^\s+[A-Za-z]+\??:/.test(line))
    for (const field of [
      'scopeChanged',
      'validityChanged',
      'blockers',
      'nextAction',
      'effectivePolicy',
      'projectionChanges',
      'automaticReturn',
      'bypassFlag',
      'differences',
    ]) {
      expect(fieldLines.some((line) => line.trim().startsWith(`${field}`))).toBe(true)
    }
    expect(fieldLines.length).toBeGreaterThan(30)
    expect(fieldLines.filter((line) => !/\/\/\s*\S/.test(line))).toEqual([])
  })
})
