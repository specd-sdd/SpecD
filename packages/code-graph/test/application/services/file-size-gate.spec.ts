import { describe, expect, it } from 'vitest'
import { createFileSizeGate } from '../../../src/application/services/file-size-gate.js'
import {
  DEFAULT_MAX_FILE_BYTES,
  type EffectiveGraphConfig,
  type EffectiveWorkspaceGraphConfig,
} from '../../../src/application/use-cases/_shared/resolve-effective-graph-config.js'

function makeEffectiveConfig(overrides?: Partial<EffectiveGraphConfig>): EffectiveGraphConfig {
  return {
    includePaths: [],
    globalExcludePaths: [],
    syntheticSpecExcludePaths: [],
    rootExcludePaths: [],
    rootMaxFileBytes: DEFAULT_MAX_FILE_BYTES,
    rootLargeFilePaths: [],
    workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
      [
        'app',
        {
          excludePaths: [],
          respectGitignore: true,
          maxFileBytes: DEFAULT_MAX_FILE_BYTES,
          projectLargeFilePaths: [],
          workspaceLargeFilePaths: [],
        },
      ],
    ]),
    ...overrides,
  }
}

describe('createFileSizeGate', () => {
  it('allows 262144 bytes and skips 262145 bytes by default', () => {
    const config = makeEffectiveConfig()
    const gate = createFileSizeGate(config, (p) => (p.includes('big') ? 262145 : 262144))

    const atLimit = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/ok.ts',
      projectRelativePath: 'packages/app/src/ok.ts',
      absolutePath: '/repo/packages/app/src/ok.ts',
    })
    expect(atLimit).toEqual({ kind: 'within-limit', sizeBytes: 262144 })

    const overLimit = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/big.ts',
      projectRelativePath: 'packages/app/src/big.ts',
      absolutePath: '/repo/packages/app/src/big.ts',
    })
    expect(overLimit).toEqual({
      kind: 'skip',
      sizeBytes: 262145,
      limitBytes: 262144,
    })
  })

  it('allows arbitrarily large files when limit is 0', () => {
    const config = makeEffectiveConfig({
      rootMaxFileBytes: 0,
      workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
        [
          'app',
          {
            excludePaths: [],
            respectGitignore: true,
            maxFileBytes: 0,
            projectLargeFilePaths: [],
            workspaceLargeFilePaths: [],
          },
        ],
      ]),
    })
    const gate = createFileSizeGate(config, () => 100_000_000)

    const decision = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/huge.ts',
      projectRelativePath: 'packages/app/src/huge.ts',
      absolutePath: '/repo/packages/app/src/huge.ts',
    })
    expect(decision).toEqual({ kind: 'within-limit', sizeBytes: 100_000_000 })
  })

  it('respects workspace-specific limit override', () => {
    const config = makeEffectiveConfig({
      rootMaxFileBytes: 262144,
      workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
        [
          'custom-ws',
          {
            excludePaths: [],
            respectGitignore: true,
            maxFileBytes: 500_000,
            projectLargeFilePaths: [],
            workspaceLargeFilePaths: [],
          },
        ],
      ]),
    })
    const gate = createFileSizeGate(config, () => 350_000)

    const wsDecision = gate.decide({
      workspaceName: 'custom-ws',
      relativeToCodeRoot: 'src/file.ts',
      projectRelativePath: 'packages/custom-ws/src/file.ts',
      absolutePath: '/repo/packages/custom-ws/src/file.ts',
    })
    expect(wsDecision).toEqual({ kind: 'within-limit', sizeBytes: 350_000 })

    const rootDecision = gate.decide({
      workspaceName: 'root',
      relativeToCodeRoot: 'global.ts',
      projectRelativePath: 'global.ts',
      absolutePath: '/repo/global.ts',
    })
    expect(rootDecision).toEqual({
      kind: 'skip',
      sizeBytes: 350_000,
      limitBytes: 262144,
    })
  })

  it('measures size in bytes for multibyte content', () => {
    const config = makeEffectiveConfig()
    // Simulated UTF-8 multibyte file where byte length > char count
    const byteLength = Buffer.byteLength('🚀'.repeat(100_000), 'utf-8')
    const gate = createFileSizeGate(config, () => byteLength)

    const decision = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/emojis.ts',
      projectRelativePath: 'packages/app/src/emojis.ts',
      absolutePath: '/repo/packages/app/src/emojis.ts',
    })
    expect(decision).toEqual({
      kind: 'skip',
      sizeBytes: byteLength,
      limitBytes: 262144,
    })
  })

  it('returns within-limit with sizeBytes null when stat fails', () => {
    const config = makeEffectiveConfig()
    const gate = createFileSizeGate(config, () => null)

    const decision = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'missing.ts',
      projectRelativePath: 'packages/app/missing.ts',
      absolutePath: '/repo/packages/app/missing.ts',
    })
    expect(decision).toEqual({ kind: 'within-limit', sizeBytes: null })
  })

  it('exempts oversized file matching project-level largeFilePaths evaluated relative to project root', () => {
    const config = makeEffectiveConfig({
      rootLargeFilePaths: ['packages/app/src/generated/**'],
    })
    const gate = createFileSizeGate(config, () => 500_000)

    const exempt = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/generated/schema.ts',
      projectRelativePath: 'packages/app/src/generated/schema.ts',
      absolutePath: '/repo/packages/app/src/generated/schema.ts',
    })
    expect(exempt).toEqual({ kind: 'exempt', sizeBytes: 500_000 })

    const notExempt = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/other/schema.ts',
      projectRelativePath: 'packages/app/src/other/schema.ts',
      absolutePath: '/repo/packages/app/src/other/schema.ts',
    })
    expect(notExempt).toEqual({
      kind: 'skip',
      sizeBytes: 500_000,
      limitBytes: 262144,
    })
  })

  it('exempts oversized file matching workspace-level largeFilePaths evaluated relative to codeRoot', () => {
    const config = makeEffectiveConfig({
      workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
        [
          'app',
          {
            excludePaths: [],
            respectGitignore: true,
            maxFileBytes: 262144,
            projectLargeFilePaths: [],
            workspaceLargeFilePaths: ['vendor/bundle.js'],
          },
        ],
      ]),
    })
    const gate = createFileSizeGate(config, () => 800_000)

    const exempt = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'vendor/bundle.js',
      projectRelativePath: 'packages/app/vendor/bundle.js',
      absolutePath: '/repo/packages/app/vendor/bundle.js',
    })
    expect(exempt).toEqual({ kind: 'exempt', sizeBytes: 800_000 })
  })

  it('exempts via union of project and workspace exemption patterns', () => {
    const config = makeEffectiveConfig({
      rootLargeFilePaths: ['packages/app/project-exempt.ts'],
      workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
        [
          'app',
          {
            excludePaths: [],
            respectGitignore: true,
            maxFileBytes: 262144,
            projectLargeFilePaths: ['packages/app/project-exempt.ts'],
            workspaceLargeFilePaths: ['workspace-exempt.ts'],
          },
        ],
      ]),
    })
    const gate = createFileSizeGate(config, () => 500_000)

    const projectMatched = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'project-exempt.ts',
      projectRelativePath: 'packages/app/project-exempt.ts',
      absolutePath: '/repo/packages/app/project-exempt.ts',
    })
    expect(projectMatched.kind).toBe('exempt')

    const workspaceMatched = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'workspace-exempt.ts',
      projectRelativePath: 'packages/app/workspace-exempt.ts',
      absolutePath: '/repo/packages/app/workspace-exempt.ts',
    })
    expect(workspaceMatched.kind).toBe('exempt')
  })

  it('supports per-list negation in exemption patterns', () => {
    const config = makeEffectiveConfig({
      rootLargeFilePaths: ['packages/app/big/**', '!packages/app/big/unexempt.ts'],
    })
    const gate = createFileSizeGate(config, () => 500_000)

    const exempt = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'big/exempt.ts',
      projectRelativePath: 'packages/app/big/exempt.ts',
      absolutePath: '/repo/packages/app/big/exempt.ts',
    })
    expect(exempt.kind).toBe('exempt')

    const unexempt = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'big/unexempt.ts',
      projectRelativePath: 'packages/app/big/unexempt.ts',
      absolutePath: '/repo/packages/app/big/unexempt.ts',
    })
    expect(unexempt.kind).toBe('skip')
  })

  it('rejects ../ project paths from matching project-level exemptions', () => {
    const config = makeEffectiveConfig({
      rootLargeFilePaths: ['**'],
    })
    const gate = createFileSizeGate(config, () => 500_000)

    const decision = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'file.ts',
      projectRelativePath: '../outside/file.ts',
      absolutePath: '/outside/file.ts',
    })
    expect(decision.kind).toBe('skip')
  })

  it('returns within-limit when a file matches largeFilePaths but is under the limit', () => {
    const config = makeEffectiveConfig({
      rootLargeFilePaths: ['packages/app/src/file.ts'],
    })
    const gate = createFileSizeGate(config, () => 1000)

    const decision = gate.decide({
      workspaceName: 'app',
      relativeToCodeRoot: 'src/file.ts',
      projectRelativePath: 'packages/app/src/file.ts',
      absolutePath: '/repo/packages/app/src/file.ts',
    })
    // Must be within-limit, not exempt, since it is not over the limit
    expect(decision).toEqual({ kind: 'within-limit', sizeBytes: 1000 })
  })

  it('reads the size of a file exactly once per decision, whatever the outcome', () => {
    // Given a size reader that counts its calls and a workspace exemption for one path
    const reads: string[] = []
    const config = makeEffectiveConfig({
      workspaces: new Map<string, EffectiveWorkspaceGraphConfig>([
        [
          'app',
          {
            excludePaths: [],
            respectGitignore: true,
            maxFileBytes: 100,
            projectLargeFilePaths: [],
            workspaceLargeFilePaths: ['gen/**'],
          },
        ],
      ]),
    })
    const gate = createFileSizeGate(config, (path) => {
      reads.push(path)
      return 500
    })

    // When files are decided as skip, exempt and within-limit (limit exceeded for the first two)
    for (const relative of ['src/a.ts', 'gen/b.ts']) {
      gate.decide({
        workspaceName: 'app',
        relativeToCodeRoot: relative,
        projectRelativePath: `packages/app/${relative}`,
        absolutePath: `/repo/packages/app/${relative}`,
      })
    }

    // Then each file was measured once, with no extra read for the exemption check
    expect(reads).toEqual(['/repo/packages/app/src/a.ts', '/repo/packages/app/gen/b.ts'])
  })
})
