/* eslint-disable @typescript-eslint/unbound-method */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSchemaFork } from '../../src/commands/schema/fork.js'
import { type SchemaRawResult } from '@specd/core'

const mockRaw: SchemaRawResult = {
  data: { name: 'schema-std', kind: 'schema' as const, version: 1 },
  templates: new Map(),
  resolvedPath: '/fake/node_modules/@specd/schema-std/schema.yaml',
}

function setup(configOverrides: Parameters<typeof makeMockConfig>[0] = {}) {
  const config = makeMockConfig(configOverrides)
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('schema fork', () => {
  it('--workspace and --output are mutually exclusive', async () => {
    setup()

    const program = makeProgram()
    registerSchemaFork(program.command('schema'))

    await expect(
      program.parseAsync([
        'node',
        'specd',
        'schema',
        'fork',
        '@specd/schema-std',
        'my-fork',
        '--workspace',
        'default',
        '--output',
        '/tmp/out',
      ]),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits with code 3 when source schema is not found', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue(null)

    const program = makeProgram()
    registerSchemaFork(program.command('schema'))

    await expect(
      program.parseAsync(['node', 'specd', 'schema', 'fork', 'nonexistent', 'my-fork']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })

  it('exits with code 1 when workspace has no schemasPath', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue(mockRaw)

    const program = makeProgram()
    registerSchemaFork(program.command('schema'))

    await expect(
      program.parseAsync(['node', 'specd', 'schema', 'fork', '@specd/schema-std', 'my-fork']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/no schemas directory/)
  })

  describe('fork with --output (real I/O)', () => {
    let tmpDir: string

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-fork-test-'))
    })

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true })
    })

    it('creates the target directory and copies schema files with updated name', async () => {
      const { kernel, stdout } = setup()

      // Create a fake source schema directory with a schema.yaml
      const sourceDir = path.join(tmpDir, 'source')
      await fs.mkdir(sourceDir, { recursive: true })
      await fs.writeFile(
        path.join(sourceDir, 'schema.yaml'),
        'kind: schema\nname: schema-std\nversion: 1\n',
        'utf-8',
      )

      vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue({
        ...mockRaw,
        resolvedPath: path.join(sourceDir, 'schema.yaml'),
      })

      const outputDir = path.join(tmpDir, 'forked')

      const program = makeProgram()
      registerSchemaFork(program.command('schema'))
      await program.parseAsync([
        'node',
        'specd',
        'schema',
        'fork',
        '@specd/schema-std',
        'my-forked-schema',
        '--output',
        outputDir,
      ])

      // Verify the directory was created and schema.yaml was copied with updated name
      const stat = await fs.stat(outputDir)
      expect(stat.isDirectory()).toBe(true)

      const copied = await fs.readFile(path.join(outputDir, 'schema.yaml'), 'utf-8')
      expect(copied).toContain('kind: schema')
      expect(copied).toContain('name: my-forked-schema')

      expect(stdout()).toContain(outputDir)
    })
  })
})
