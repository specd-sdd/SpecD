/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecShow } from '../../src/commands/spec/show.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

const mockSpecResult = {
  artifacts: new Map([
    ['spec.md', { content: '# Auth Spec\n\nContent here.' }],
    ['verify.md', { content: '## Scenarios' }],
  ]),
}

describe('spec show', () => {
  it('prints artifact contents with headers when no --file given', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('# Auth Spec')
    expect(out).toContain('--- verify.md ---')
    expect(out).toContain('## Scenarios')
  })

  it('prints all artifact contents in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('# Auth Spec')
    expect(out).toContain('## Scenarios')
  })

  it('exits 1 when spec not found', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.get.execute.mockResolvedValue(null)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'missing/spec']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('not found')
  })

  it('outputs JSON as array of {filename, content}', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue(mockSpecResult)

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].filename).toBe('spec.md')
    expect(parsed[0].content).toContain('# Auth Spec')
  })

  it('excludes .specd-metadata.yaml from text output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: '# Auth Spec' }],
        ['.specd-metadata.yaml', { content: 'id: auth/login\ntitle: Auth' }],
        ['verify.md', { content: '## Scenarios' }],
      ]),
    })

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('--- verify.md ---')
    expect(out).not.toContain('.specd-metadata.yaml')
    expect(out).not.toContain('id: auth/login')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'show', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('rejects when path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await expect(program.parseAsync(['node', 'specd', 'spec', 'show'])).rejects.toThrow()
  })

  it('excludes .specd-metadata.yaml from JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: '# Auth Spec' }],
        ['.specd-metadata.yaml', { content: 'id: auth/login\ntitle: Auth' }],
      ]),
    })

    const program = makeProgram()
    registerSpecShow(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'show', 'auth/login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.find((a: { filename: string }) => a.filename === 'spec.md')).toBeDefined()
    expect(
      parsed.find((a: { filename: string }) => a.filename === '.specd-metadata.yaml'),
    ).toBeUndefined()
  })
})
