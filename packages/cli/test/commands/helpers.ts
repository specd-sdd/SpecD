/**
 * Shared test helpers for CLI command tests.
 *
 * All command tests mock `loadConfig` and `createCliKernel`. This module
 * provides factory functions for minimal-valid mock objects so individual
 * test files stay focused on what they're testing.
 */
import { vi } from 'vitest'
import { Command } from 'commander'
import type { SpecdConfig, Kernel } from '@specd/core'

/**
 * Mirrors the {@link Kernel} shape but with every `execute` replaced by a
 * Vitest mock, so callers can use `.mockResolvedValue()` etc. without casts.
 *
 * Uses `ReturnType<typeof vi.fn>` rather than `Mock` to preserve the widened
 * mock API while keeping the intersection with `Kernel` compatible.
 */
export type MockKernel = {
  [G in keyof Kernel]: {
    [K in keyof Kernel[G]]: { execute: ReturnType<typeof vi.fn> }
  }
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
  }

  const specs = {
    approveSpec: { execute: vi.fn() },
    approveSignoff: { execute: vi.fn() },
    list: { execute: vi.fn().mockResolvedValue([]) },
    get: { execute: vi.fn() },
    saveMetadata: { execute: vi.fn() },
    getActiveSchema: {
      execute: vi.fn().mockResolvedValue({ name: () => '@specd/schema-std', version: () => 1 }),
    },
    validate: { execute: vi.fn() },
  }

  const project = {
    init: { execute: vi.fn() },
    recordSkillInstall: { execute: vi.fn() },
    getSkillsManifest: { execute: vi.fn() },
    getProjectContext: {
      execute: vi.fn().mockResolvedValue({ contextEntries: [], specs: [], warnings: [] }),
    },
  }

  return { changes, specs, project, ...overrides } as unknown as Kernel & MockKernel
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
