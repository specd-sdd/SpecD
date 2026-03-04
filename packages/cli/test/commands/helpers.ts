/**
 * Shared test helpers for CLI command tests.
 *
 * All command tests mock `loadConfig` and `createCliKernel`. This module
 * provides factory functions for minimal-valid mock objects so individual
 * test files stay focused on what they're testing.
 */
import { vi } from 'vitest'
import { Command } from 'commander'
import type { SpecdConfig } from '@specd/core'

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
        storagePath: '/project/.specd/default',
        ownership: [],
        contextIncludeSpecs: false,
        isExternal: false,
      },
    ],
    storage: {
      changesPath: '/project/.specd/changes',
      draftsPath: '/project/.specd/drafts',
      discardedPath: '/project/.specd/discarded',
      archivePath: '/project/.specd/archive',
    },
    context: [],
    approvals: { spec: false, signoff: false },
    hooks: {},
    ...overrides,
  } as unknown as SpecdConfig
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

export function makeMockKernel(overrides: Record<string, any> = {}): any {
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
    compileContext: { execute: vi.fn() },
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

  return { changes, specs, project, ...overrides }
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
