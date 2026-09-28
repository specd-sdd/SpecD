import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { ChangeNotFoundError } from '@specd/sdk'
import { registerChangeEdit } from '../../src/commands/change/edit.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change edit', () => {
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

  it('exits 1 when --add-spec uses unknown workspace prefix', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when --add-spec targets readOnly workspace', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'platform',
          specsPath: '/external/platform/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/external/platform/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/external/platform',
          ownership: 'readOnly' as const,
          isExternal: true,
        },
      ],
    })
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: config,
      configFilePath: null,
      kernel: kernel,
    })
    const stderr = captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'platform:auth/tokens'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
    expect(kernel.changes.edit.execute).not.toHaveBeenCalled()
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
})
