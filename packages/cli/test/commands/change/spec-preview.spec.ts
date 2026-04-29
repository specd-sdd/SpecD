import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeSpecPreview } from '../../../src/commands/change/spec-preview.js'
import { ChangeNotFoundError, SpecNotInChangeError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change spec-preview', () => {
  it('minimal invocation succeeds and outputs merged content in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: '# Old content',
          merged: '# New content',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    const out = stdout()
    expect(out).toContain('# New content')
  })

  it('outputs file header lines before each file', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: null,
          merged: '# Spec content',
        },
        {
          filename: 'verify.md',
          base: null,
          merged: '# Verify content',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('--- verify.md ---')
    expect(out).toContain('# Spec content')
    expect(out).toContain('# Verify content')
  })

  it('renders merged content suitable for drift and overlap review', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: '# Spec\n\nOld requirement',
          merged: '# Spec\n\nUpdated requirement that preserves existing context',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('Updated requirement that preserves existing context')
    expect(out).not.toContain('Old requirement')
  })

  it('--diff flag outputs unified diff per file', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: '# Old',
          merged: '# New',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'spec-preview',
      'feat',
      'auth/login',
      '--diff',
    ])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    // diff lines are present (chalk-stripped content still contains the text)
    expect(out).toMatch(/#\s*Old|#\s*New/)
  })

  it('--format json outputs valid JSON with PreviewSpecResult shape', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: null,
          merged: '# Content',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'spec-preview',
      'feat',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as {
      specId: string
      changeName: string
      files: { filename: string; merged: string }[]
      warnings: string[]
    }
    expect(parsed.specId).toBe('default:auth/login')
    expect(parsed.changeName).toBe('feat')
    expect(Array.isArray(parsed.files)).toBe(true)
    expect(parsed.files[0]?.filename).toBe('spec.md')
    expect(Array.isArray(parsed.warnings)).toBe(true)
  })

  it('outputs "no preview files" message when result has no files', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    expect(stdout()).toContain('No preview files')
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.preview.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'spec-preview', 'missing', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when spec not in change', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.preview.execute.mockRejectedValue(
      new SpecNotInChangeError('default:billing/invoices', 'feat'),
    )

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'default:billing/invoices'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('prints warnings to stderr', async () => {
    const { kernel } = setup()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: null,
          merged: '# Content',
        },
      ],
      warnings: ['Failed to parse verify.md: syntax error'],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    expect(consoleErrorSpy).toHaveBeenCalledWith('warning: Failed to parse verify.md: syntax error')
  })

  it('passes name and specId to execute', async () => {
    const { kernel } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'spec-preview',
      'feat',
      'default:auth/login',
    ])

    expect(kernel.changes.preview.execute).toHaveBeenCalledWith({
      name: 'feat',
      specId: 'default:auth/login',
    })
  })

  describe('--artifact flag', () => {
    const mockSchema = {
      artifact: vi.fn(),
    }

    it('filters output by artifact ID', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [
          { filename: 'spec.md', base: null, merged: '# Spec' },
          { filename: 'verify.md', base: null, merged: '# Verify' },
        ],
        warnings: [],
      })
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'specs',
        scope: 'spec',
        output: 'specs/**/spec.md',
      })

      const program = makeProgram()
      registerChangeSpecPreview(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'spec-preview',
        'feat',
        'auth/login',
        '--artifact',
        'specs',
      ])

      const out = stdout()
      expect(out).toContain('--- spec.md ---')
      expect(out).toContain('# Spec')
      expect(out).not.toContain('--- verify.md ---')
      expect(out).not.toContain('# Verify')
    })

    it('exits 1 for unknown artifact ID', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [],
        warnings: [],
      })
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue(null)

      const program = makeProgram()
      registerChangeSpecPreview(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'spec-preview',
          'feat',
          'auth/login',
          '--artifact',
          'unknown',
        ])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("unknown artifact ID 'unknown'")
    })

    it('exits 1 for artifact with non-spec scope', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [],
        warnings: [],
      })
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'proposal',
        scope: 'change',
        output: 'proposal.md',
      })

      const program = makeProgram()
      registerChangeSpecPreview(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'spec-preview',
          'feat',
          'auth/login',
          '--artifact',
          'proposal',
        ])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("artifact 'proposal' has scope 'change' (must be 'spec' to show)")
    })

    it('exits 1 if requested artifact is not found in change preview', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [{ filename: 'spec.md', base: null, merged: '# Spec' }],
        warnings: [],
      })
      kernel.specs.getActiveSchema.execute.mockResolvedValue({ raw: false, schema: mockSchema })
      mockSchema.artifact.mockReturnValue({
        id: 'verify',
        scope: 'spec',
        output: 'specs/**/verify.md',
      })

      const program = makeProgram()
      registerChangeSpecPreview(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'spec-preview',
          'feat',
          'auth/login',
          '--artifact',
          'verify',
        ])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain(
        "artifact 'verify' (verify.md) not found in change for spec 'auth/login'",
      )
    })
  })
})
