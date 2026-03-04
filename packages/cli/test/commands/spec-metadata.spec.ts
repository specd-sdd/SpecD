/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))
vi.mock('@specd/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/core')>()
  return { ...actual, createArtifactParserRegistry: vi.fn() }
})

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { createArtifactParserRegistry } from '@specd/core'
import { registerSpecMetadata } from '../../src/commands/spec/metadata.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
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

  it('does not show source line when --infer is not passed', async () => {
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

    expect(stdout()).not.toContain('source:')
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

  it('exits 1 with error when metadata file is absent and --infer not passed', async () => {
    const { kernel, stderr } = setup()
    kernel.specs.get.execute.mockResolvedValue({ artifacts: new Map() })

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login'])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('exits 1 when workspace is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecMetadata(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'unknown-ws:auth/login'])

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

  describe('--infer', () => {
    function makeMockSchema() {
      const mockArtifactType = {
        scope: () => 'spec',
        format: () => 'markdown',
        output: () => 'spec.md',
        contextSections: () => [
          {
            selector: { type: 'section', matches: '^Requirements$' },
            role: 'rules' as const,
            extract: 'content' as const,
          },
          {
            selector: { type: 'section', matches: '^Constraints$' },
            role: 'constraints' as const,
            extract: 'content' as const,
          },
          {
            selector: { type: 'section', matches: '^Scenarios$' },
            role: 'scenarios' as const,
            extract: 'content' as const,
          },
        ],
      }
      return {
        artifacts: () => [mockArtifactType],
        artifact: (id: string) => (id === 'spec' ? mockArtifactType : null),
      }
    }

    function makeMockParser() {
      return {
        parse: (content: string) => ({
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Requirements',
                children: [{ type: 'paragraph', value: 'Must validate input' }],
              },
              {
                type: 'section',
                label: 'Constraints',
                children: [{ type: 'paragraph', value: 'Must use HTTPS' }],
              },
              {
                type: 'section',
                label: 'Scenarios',
                children: [
                  { type: 'paragraph', value: 'Valid input accepted' },
                  { type: 'paragraph', value: 'Invalid input rejected' },
                ],
              },
            ],
          },
        }),
        renderSubtree: (node: { value?: string; label?: string }) => node.value ?? node.label ?? '',
      }
    }

    it('shows source: recorded when --infer passed but metadata is fresh', async () => {
      const { kernel, stdout } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([
          ['spec.md', { content: specContent }],
          ['.specd-metadata.yaml', { content: metadataYaml }],
        ]),
      })

      const program = makeProgram()
      registerSpecMetadata(program.command('spec'))
      await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login', '--infer'])

      const out = stdout()
      expect(out).toContain('source: recorded')
      expect(out).toContain('rules:       1')
    })

    it('infers semantic sections from artifacts when metadata is stale', async () => {
      const { kernel, stdout } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([
          ['spec.md', { content: 'changed content' }],
          ['.specd-metadata.yaml', { content: metadataYaml }],
        ]),
      })

      const mockSchema = makeMockSchema()
      kernel.specs.getActiveSchema.execute.mockResolvedValue(mockSchema)

      const mockParser = makeMockParser()
      vi.mocked(createArtifactParserRegistry).mockReturnValue(
        new Map([['markdown', mockParser]]) as never,
      )

      const program = makeProgram()
      registerSpecMetadata(program.command('spec'))
      await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login', '--infer'])

      const out = stdout()
      expect(out).toContain('source: inferred')
      // Title and description still come from recorded metadata
      expect(out).toContain('title:       Login')
      expect(out).toContain('description: Handles user authentication')
      // Counts reflect inferred sections
      expect(out).toContain('rules:')
      expect(out).toContain('constraints:')
      expect(out).toContain('scenarios:')
    })

    it('falls back to capability path as title when metadata is absent', async () => {
      const { kernel, stdout } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([['spec.md', { content: '# Some spec content' }]]),
      })

      const mockSchema = makeMockSchema()
      kernel.specs.getActiveSchema.execute.mockResolvedValue(mockSchema)

      const mockParser = makeMockParser()
      vi.mocked(createArtifactParserRegistry).mockReturnValue(
        new Map([['markdown', mockParser]]) as never,
      )

      const program = makeProgram()
      registerSpecMetadata(program.command('spec'))
      await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login', '--infer'])

      const out = stdout()
      expect(out).toContain('source: inferred')
      expect(out).toContain('title:       auth/login')
      expect(out).not.toContain('description:')
      expect(out).not.toContain('content hashes:')
      expect(out).not.toContain('dependsOn:')
    })

    it('exits 1 when --infer and no artifact files exist', async () => {
      const { kernel, stderr } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([['.specd-metadata.yaml', { content: metadataYaml }]]),
      })

      // Make metadata stale by having no spec.md to hash against
      const staleMetadata = metadataYaml.replace(specHash, 'sha256:0000000000000000')

      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([['.specd-metadata.yaml', { content: staleMetadata }]]),
      })

      const mockSchema = makeMockSchema()
      kernel.specs.getActiveSchema.execute.mockResolvedValue(mockSchema)
      vi.mocked(createArtifactParserRegistry).mockReturnValue(
        new Map([['markdown', makeMockParser()]]) as never,
      )

      const program = makeProgram()
      registerSpecMetadata(program.command('spec'))
      await program.parseAsync(['node', 'specd', 'spec', 'metadata', 'auth/login', '--infer'])

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('error:')
    })

    it('includes source in JSON when --infer is passed', async () => {
      const { kernel, stdout } = setup()
      kernel.specs.get.execute.mockResolvedValue({
        artifacts: new Map([
          ['spec.md', { content: 'changed content' }],
          ['.specd-metadata.yaml', { content: metadataYaml }],
        ]),
      })

      const mockSchema = makeMockSchema()
      kernel.specs.getActiveSchema.execute.mockResolvedValue(mockSchema)

      const mockParser = makeMockParser()
      vi.mocked(createArtifactParserRegistry).mockReturnValue(
        new Map([['markdown', mockParser]]) as never,
      )

      const program = makeProgram()
      registerSpecMetadata(program.command('spec'))
      await program.parseAsync([
        'node',
        'specd',
        'spec',
        'metadata',
        'auth/login',
        '--infer',
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout())
      expect(parsed.source).toBe('inferred')
      expect(parsed.fresh).toBe(false)
      expect(parsed.title).toBe('Login')
    })

    it('omits source from JSON when --infer is not passed', async () => {
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
      expect(parsed.source).toBeUndefined()
    })
  })
})
