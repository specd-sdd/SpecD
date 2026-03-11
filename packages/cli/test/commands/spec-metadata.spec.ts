/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
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
import { registerSpecMetadata } from '../../src/commands/spec/metadata.js'

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

const specContent = '# Auth Spec\n\nContent here.'
const specHash = `sha256:${createHash('sha256').update(specContent).digest('hex')}`

const metadataYaml = [
  'title: Login',
  'description: Handles user authentication',
  'contentHashes:',
  `  spec.md: ${specHash}`,
  'dependsOn:',
  '  - default:auth/shared-errors',
  'rules:',
  '  - requirement: Must validate email',
  '    rules:',
  '      - email must contain @',
  'constraints:',
  '  - Must use HTTPS',
  'scenarios:',
  '  - requirement: Must validate email',
  '    name: valid email accepted',
].join('\n')

describe('spec metadata', () => {
  it('exits with error when path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await expect(program.parseAsync(['node', 'specd', 'spec', 'metadata'])).rejects.toThrow()
  })

  it('prints structured text with spec label and title', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: specContent }],
        ['.specd-metadata.yaml', { content: metadataYaml }],
      ]),
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    const out = stdout()
    expect(out).toContain('spec: default:auth/login')
    expect(out).toContain('title:       Login')
    expect(out).toContain('description: Handles user authentication')
  })

  it('shows content hash freshness in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: specContent }],
        ['.specd-metadata.yaml', { content: metadataYaml }],
      ]),
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    const out = stdout()
    expect(out).toContain('content hashes:')
    expect(out).toContain('spec.md  fresh')
  })

  it('shows STALE when hash does not match', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: 'changed content' }],
        ['.specd-metadata.yaml', { content: metadataYaml }],
      ]),
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    const out = stdout()
    expect(out).toContain('spec.md  STALE')
  })

  it('exits 1 with error when metadata file is absent', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.get.execute.mockResolvedValue({ artifacts: new Map() })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'metadata', 'unknown-ws:auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('outputs JSON with fresh flag and contentHashes array', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: specContent }],
        ['.specd-metadata.yaml', { content: metadataYaml }],
      ]),
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'metadata',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.spec).toBe('default:auth/login')
    expect(parsed.fresh).toBe(true)
    expect(Array.isArray(parsed.contentHashes)).toBe(true)
    expect(parsed.contentHashes[0].filename).toBe('spec.md')
    expect(parsed.contentHashes[0].fresh).toBe(true)
    expect(Array.isArray(parsed.rules)).toBe(true)
    expect(Array.isArray(parsed.constraints)).toBe(true)
  })

  it('shows section counts in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.get.execute.mockResolvedValue({
      artifacts: new Map([
        ['spec.md', { content: specContent }],
        ['.specd-metadata.yaml', { content: metadataYaml }],
      ]),
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    const out = stdout()
    expect(out).toContain('rules:       1')
    expect(out).toContain('constraints: 1')
    expect(out).toContain('scenarios:   1')
  })
})
