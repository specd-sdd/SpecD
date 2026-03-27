/**
 * Shared test helpers for CLI command tests.
 *
 * All command tests mock `loadConfig` and `createCliKernel`. This module
 * provides factory functions for minimal-valid mock objects so individual
 * test files stay focused on what they're testing.
 */
import type { Stats } from 'node:fs'
import { vi } from 'vitest'
import { Command } from 'commander'
import type { SpecdConfig, Kernel, SpecRepository, ChangeRepository } from '@specd/core'
import type { Skill } from '@specd/skills'

/**
 * Mirrors the {@link Kernel} shape but with every `execute` replaced by a
 * Vitest mock, so callers can use `.mockResolvedValue()` etc. without casts.
 *
 * Uses `ReturnType<typeof vi.fn>` rather than `Mock` to preserve the widened
 * mock API while keeping the intersection with `Kernel` compatible.
 */
export type MockKernel = {
  [G in keyof Kernel]: Kernel[G] extends Record<string, unknown>
    ? {
        [K in keyof Kernel[G]]: Kernel[G][K] extends { execute: (...args: never[]) => unknown }
          ? { execute: ReturnType<typeof vi.fn> }
          : Kernel[G][K]
      }
    : Kernel[G]
}

/**
 * Sentinel thrown by the `mockProcessExit` mock so code under test does
 * not keep executing after a `process.exit()` call.
 */
export class ExitSentinel extends Error {
  readonly code: number
  constructor(code: number) {
    super(`process.exit(${code})`)
    this.code = code
  }
}

/**
 * Replaces `process.exit` with a spy that throws an {@link ExitSentinel}
 * instead of silently continuing execution. Call in `beforeEach` or a
 * test-level setup function — the spy is restored by `vi.restoreAllMocks()`.
 */
export function mockProcessExit(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    throw new ExitSentinel(code)
  }) as never)
}

// ---------------------------------------------------------------------------
// Minimal SpecdConfig factory
// ---------------------------------------------------------------------------

export function makeMockConfig(overrides: Partial<SpecdConfig> = {}): SpecdConfig {
  return {
    projectRoot: '/project',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: '/project/specs',
        schemasPath: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
    storage: {
      changesPath: '/project/.specd/changes',
      draftsPath: '/project/.specd/drafts',
      discardedPath: '/project/.specd/discarded',
      archivePath: '/project/.specd/archive',
    },
    approvals: { spec: false, signoff: false },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock Change object factory
// ---------------------------------------------------------------------------

export function makeMockChange(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'my-change',
    state: 'designing',
    specIds: ['auth/login'],
    workspaces: ['default'],
    createdAt: new Date('2026-01-15T10:00:00Z'),
    description: undefined,
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history: [],
    isDrafted: false,
    artifacts: new Map(),
    effectiveStatus: () => 'missing',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock kernel factory
// ---------------------------------------------------------------------------

export function makeMockKernel(overrides: Record<string, unknown> = {}): Kernel & MockKernel {
  const changes = {
    repo: {
      artifactExists: vi.fn().mockResolvedValue(false),
      deltaExists: vi.fn().mockResolvedValue(false),
    } as unknown as ChangeRepository,
    create: { execute: vi.fn() },
    list: { execute: vi.fn().mockResolvedValue([]) },
    listDrafts: { execute: vi.fn().mockResolvedValue([]) },
    listDiscarded: { execute: vi.fn().mockResolvedValue([]) },
    listArchived: { execute: vi.fn().mockResolvedValue([]) },
    getArchived: { execute: vi.fn() },
    status: { execute: vi.fn() },
    transition: { execute: vi.fn() },
    draft: { execute: vi.fn() },
    restore: { execute: vi.fn() },
    discard: { execute: vi.fn() },
    archive: { execute: vi.fn() },
    validate: { execute: vi.fn() },
    edit: { execute: vi.fn() },
    skipArtifact: { execute: vi.fn() },
    compile: { execute: vi.fn() },
    updateSpecDeps: { execute: vi.fn() },
    runStepHooks: { execute: vi.fn() },
    getHookInstructions: { execute: vi.fn() },
    getArtifactInstruction: { execute: vi.fn() },
    detectOverlap: {
      execute: vi.fn().mockResolvedValue({ hasOverlap: false, entries: [] }),
    },
    preview: { execute: vi.fn() },
  }

  const specs = {
    repos: new Map([
      [
        'default',
        { resolveFromPath: vi.fn().mockResolvedValue(null) } as unknown as SpecRepository,
      ],
    ]),
    approveSpec: { execute: vi.fn() },
    approveSignoff: { execute: vi.fn() },
    list: { execute: vi.fn().mockResolvedValue([]) },
    get: { execute: vi.fn() },
    saveMetadata: { execute: vi.fn() },
    getActiveSchema: {
      execute: vi.fn().mockResolvedValue({
        name: () => '@specd/schema-std',
        version: () => 1,
        artifacts: () => [],
        workflow: () => [],
      }),
    },
    validateSchema: { execute: vi.fn() },
    validate: { execute: vi.fn() },
    invalidateMetadata: { execute: vi.fn() },
    generateMetadata: { execute: vi.fn() },
    getContext: {
      execute: vi.fn().mockResolvedValue({ entries: [], warnings: [] }),
    },
  }

  const project = {
    init: { execute: vi.fn() },
    recordSkillInstall: { execute: vi.fn() },
    getSkillsManifest: { execute: vi.fn() },
    getProjectContext: {
      execute: vi.fn().mockResolvedValue({ contextEntries: [], specs: [], warnings: [] }),
    },
  }

  const schemas = {
    resolve: vi.fn().mockResolvedValue(null),
    resolveRaw: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  }

  // The mock satisfies Kernel structurally at runtime (every group has every
  // key with an { execute } stub). A single cast is enough — MockKernel
  // mirrors Kernel's shape with mock execute functions.
  return { schemas, changes, specs, project, ...overrides } as unknown as Kernel & MockKernel
}

// ---------------------------------------------------------------------------
// Program builder helper
// ---------------------------------------------------------------------------

/**
 * Creates a fresh Commander program with error handling disabled (so tests
 * don't call process.exit when Commander encounters an error).
 */
export function makeProgram(): Command {
  const program = new Command()
  program.exitOverride()
  return program
}

// ---------------------------------------------------------------------------
// Stdout / stderr capture helpers
// ---------------------------------------------------------------------------

export function captureStdout(): () => string {
  const calls: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
    calls.push(String(s))
    return true
  })
  return () => calls.join('')
}

export function captureStderr(): () => string {
  const calls: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
    calls.push(String(s))
    return true
  })
  return () => calls.join('')
}

// ---------------------------------------------------------------------------
// Typed mock factories for external dependencies
// ---------------------------------------------------------------------------

/**
 * Creates a mock `Skill` with sensible defaults.
 */
export function makeMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    content: '# Test Skill',
    ...overrides,
  }
}

/**
 * Creates a minimal mock `Stats` object for `fs.stat` assertions.
 *
 * Only the structurally required fields are populated — extend with
 * overrides when your test inspects specific stat properties.
 */
export function makeMockStats(overrides: Partial<Stats> = {}): Stats {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(0),
    mtime: new Date(0),
    ctime: new Date(0),
    birthtime: new Date(0),
    ...overrides,
  } as Stats
}

/**
 * Creates a mock use-case object with a vitest mock `execute` function.
 *
 * When called with a type parameter, the returned object is typed to match
 * the expected use-case shape (e.g. `makeMockUseCase<ReturnType<typeof createFoo>>()`),
 * avoiding `as unknown as` double casts at call sites.
 *
 * @param execute - Optional pre-configured mock function
 * @returns A mock object with an `execute` property
 */
export function makeMockUseCase<
  T extends { execute: (...args: never[]) => unknown } = { execute: ReturnType<typeof vi.fn> },
>(execute: ReturnType<typeof vi.fn> = vi.fn()): T {
  // Single-point cast: the mock structurally satisfies any use-case with an execute method
  return { execute } as unknown as T
}
