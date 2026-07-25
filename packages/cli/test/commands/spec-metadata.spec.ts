import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecMetadata } from '../../src/commands/spec/metadata.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { config, kernel, stdout }
}

afterEach(() => vi.restoreAllMocks())

describe('spec metadata', () => {
  it('exits with error when path argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await expect(program.parseAsync(['node', 'specd', 'spec', 'metadata'])).rejects.toThrow()
  })

  it('delegates to kernel.specs.getMetadata and prints diagnostics', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getMetadata.execute).mockResolvedValue({
      metadata: {
        title: 'Login',
        description: 'Handles user authentication',
        generatedBy: 'core',
        rules: [{ id: 'r1', text: 'rule' }],
        constraints: [{ id: 'c1', text: 'constraint' }],
        scenarios: [{ id: 's1', text: 'scenario' }],
        dependsOn: ['core:spec-lock'],
      },
      metadataFingerprint: 'fp-abc',
      source: 'persisted',
      regenerated: false,
      warnings: [{ kind: 'metadata-cache-write-failed', specId: 'default:auth/login', error: 'e' }],
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    expect(kernel.specs.getMetadata.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
    })
    const text = stdout()
    expect(text).toContain('spec: default:auth/login')
    expect(text).toContain('source: persisted')
    expect(text).toContain('regenerated: false')
    expect(text).toContain('metadataFingerprint: fp-abc')
    expect(text).toContain('title: Login')
    expect(text).toContain('description: Handles user authentication')
    expect(text).toContain('generatedBy: core')
    expect(text).toContain('rules: 1')
    expect(text).toContain('constraints: 1')
    expect(text).toContain('scenarios: 1')
    expect(text).toContain('dependsOn:')
    expect(text).toContain('  - core:spec-lock')
    expect(text).toContain('warnings:')
    expect(text).toContain('  metadata-cache-write-failed: e')
    expect(text).not.toContain('"title"')
  })

  it('emits top-level JSON fields for structured output', async () => {
    const { kernel, stdout } = setup()
    const rules = [
      { id: 'r1', text: 'rule one' },
      { id: 'r2', text: 'rule two' },
      { id: 'r3', text: 'rule three' },
    ]
    const constraints = [
      { id: 'c1', text: 'constraint one' },
      { id: 'c2', text: 'constraint two' },
    ]
    const scenarios = [
      { id: 's1', text: 'scenario one' },
      { id: 's2', text: 'scenario two' },
      { id: 's3', text: 'scenario three' },
      { id: 's4', text: 'scenario four' },
      { id: 's5', text: 'scenario five' },
    ]
    vi.mocked(kernel.specs.getMetadata.execute).mockResolvedValue({
      metadata: {
        title: 'Login',
        description: 'Handles user authentication',
        rules,
        constraints,
        scenarios,
        dependsOn: ['core:spec-lock'],
        contentHashes: { 'spec.md': 'sha256:abc' },
      },
      metadataFingerprint: 'fp',
      source: 'generated',
      regenerated: true,
      warnings: [],
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
    expect(parsed).toMatchObject({
      spec: 'default:auth/login',
      source: 'generated',
      regenerated: true,
      metadataFingerprint: 'fp',
      warnings: [],
      metadata: { title: 'Login' },
    })
    expect(parsed.metadata.rules).toEqual(rules)
    expect(parsed.metadata.constraints).toEqual(constraints)
    expect(parsed.metadata.scenarios).toEqual(scenarios)
    expect(Array.isArray(parsed.metadata.rules)).toBe(true)
    expect(Array.isArray(parsed.metadata.constraints)).toBe(true)
    expect(Array.isArray(parsed.metadata.scenarios)).toBe(true)
    expect(parsed).not.toHaveProperty('fresh')
    expect(parsed).not.toHaveProperty('contentHashes')
    expect(parsed).not.toHaveProperty('rules')
    expect(parsed).not.toHaveProperty('constraints')
    expect(parsed).not.toHaveProperty('scenarios')
  })

  it('omits dependsOn and warnings sections in text when empty', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getMetadata.execute).mockResolvedValue({
      metadata: {
        title: 'Login',
        rules: [
          { id: 'r1', text: 'a' },
          { id: 'r2', text: 'b' },
          { id: 'r3', text: 'c' },
        ],
        constraints: [
          { id: 'c1', text: 'x' },
          { id: 'c2', text: 'y' },
        ],
        scenarios: [
          { id: 's1', text: '1' },
          { id: 's2', text: '2' },
          { id: 's3', text: '3' },
          { id: 's4', text: '4' },
          { id: 's5', text: '5' },
        ],
      },
      metadataFingerprint: 'fp',
      source: 'persisted',
      regenerated: false,
      warnings: [],
    })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    const text = stdout()
    expect(text).toContain('rules: 3')
    expect(text).toContain('constraints: 2')
    expect(text).toContain('scenarios: 5')
    expect(text).not.toContain('dependsOn:')
    expect(text).not.toContain('warnings:')
  })
})
