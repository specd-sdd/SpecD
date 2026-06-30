import { describe, it, expect, vi, afterEach } from 'vitest'
import chalk from 'chalk'
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

vi.mock('chalk', () => {
  return {
    default: {
      green: vi.fn((str) => `[green]${str}[/green]`),
      red: vi.fn((str) => `[red]${str}[/red]`),
      cyan: vi.fn((str) => `[cyan]${str}[/cyan]`),
      dim: vi.fn((str) => `[dim]${str}[/dim]`),
    },
  }
})

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeSpecPreview } from '../../../src/commands/change/spec-preview.js'
import { ChangeNotFoundError, SpecNotInChangeError } from '@specd/sdk'

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
  describe('--diff format output', () => {
    it('applies correct chalk colorization for diff lines', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [
          {
            filename: 'spec.md',
            base: 'context line 1\nremoved line\ncontext line 2',
            merged: 'context line 1\nadded line\ncontext line 2',
            status: 'merged',
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
      expect(out).toContain('[cyan]@@ -1,3 +1,3 @@[/cyan]') // Hunk header
      expect(out).toContain('[dim] context line 1[/dim]') // Context
      expect(out).toContain('[red]-removed line[/red]') // Removal
      expect(out).toContain('[green]+added line[/green]') // Addition
    })
  })

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
          status: 'merged',
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

  it('outputs file header lines with status labels', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: null,
          merged: '# Spec content',
          status: 'merged',
        },
        {
          filename: 'verify.md',
          base: '# Verify content',
          merged: '# Verify content',
          status: 'no-op',
        },
        {
          filename: 'other.md',
          base: '# Other content',
          merged: '# Other content',
          status: 'missing',
        },
        {
          filename: 'new.md',
          base: null,
          merged: '',
          status: 'missing',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerChangeSpecPreview(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'spec-preview', 'feat', 'auth/login'])

    const out = stdout()
    expect(out).toContain('--- spec.md ---')
    expect(out).toContain('--- verify.md --- (no-op delta, showing original)')
    expect(out).toContain('--- other.md --- (missing artifact, showing original)')
    expect(out).toContain('--- new.md --- (missing artifact)')
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
          status: 'merged',
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

  it('--diff flag outputs unified diff per file, skipping no-op/missing', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: '# Old',
          merged: '# New',
          status: 'merged',
        },
        {
          filename: 'verify.md',
          base: '# Old verify',
          merged: '# Old verify',
          status: 'no-op',
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
    expect(out).toMatch(/#\s*Old|#\s*New/)
    expect(out).not.toContain('--- verify.md ---')
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
          status: 'merged',
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
      files: { filename: string; merged: string; status: string }[]
      warnings: string[]
    }
    expect(parsed.specId).toBe('default:auth/login')
    expect(parsed.changeName).toBe('feat')
    expect(Array.isArray(parsed.files)).toBe(true)
    expect(parsed.files[0]?.filename).toBe('spec.md')
    expect(parsed.files[0]?.status).toBe('merged')
    expect(Array.isArray(parsed.warnings)).toBe(true)
  })

  it('--format json with --diff includes diff field in JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.preview.execute.mockResolvedValue({
      specId: 'default:auth/login',
      changeName: 'feat',
      files: [
        {
          filename: 'spec.md',
          base: '# Old',
          merged: '# New',
          status: 'merged',
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
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as {
      files: { filename: string; diff: string }[]
    }
    expect(parsed.files[0]?.diff).toContain('--- a/spec.md (base)')
    expect(parsed.files[0]?.diff).toContain('+++ b/spec.md (merged)')
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

  it('exits 1 when spec not in change and suggests specd specs show', async () => {
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
    const err = stderr()
    expect(err).toMatch(/error:/)
    expect(err).toContain(
      'Suggestion: use specd specs show default:billing/invoices to view the canonical spec',
    )
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
          status: 'merged',
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
          { filename: 'spec.md', base: null, merged: '# Spec', status: 'merged' },
          { filename: 'verify.md', base: null, merged: '# Verify', status: 'merged' },
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

    it('shows status label when filtering by artifact ID', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [{ filename: 'spec.md', base: '# Base', merged: '# Base', status: 'no-op' }],
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
      expect(out).toContain('--- spec.md --- (no-op delta, showing original)')
    })

    it('filters output and shows colorized diff when used with --diff', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [
          { filename: 'spec.md', base: '# Old Spec', merged: '# New Spec', status: 'merged' },
          { filename: 'verify.md', base: '# Old Verify', merged: '# New Verify', status: 'merged' },
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
        '--diff',
      ])

      const out = stdout()
      expect(out).toContain('--- spec.md ---')
      expect(out).toContain('[red]-# Old Spec[/red]')
      expect(out).toContain('[green]+# New Spec[/green]')
      expect(out).not.toContain('--- verify.md ---')
      expect(out).not.toContain('[red]-# Old Verify[/red]')
    })

    it('filters correctly with --format json', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.preview.execute.mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'feat',
        files: [
          { filename: 'spec.md', base: null, merged: '# Spec', status: 'merged' },
          { filename: 'verify.md', base: null, merged: '# Verify', status: 'merged' },
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
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout()) as {
        files: { filename: string }[]
      }
      expect(parsed.files).toHaveLength(1)
      expect(parsed.files[0]?.filename).toBe('spec.md')
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
        files: [{ filename: 'spec.md', base: null, merged: '# Spec', status: 'merged' }],
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
