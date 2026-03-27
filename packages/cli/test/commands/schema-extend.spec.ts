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
import { registerSchemaExtend } from '../../src/commands/schema/extend.js'
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

describe('schema extend', () => {
  it('--workspace and --output are mutually exclusive', async () => {
    setup()

    const program = makeProgram()
    registerSchemaExtend(program.command('schema'))

    await expect(
      program.parseAsync([
        'node',
        'specd',
        'schema',
        'extend',
        '@specd/schema-std',
        'my-ext',
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
    registerSchemaExtend(program.command('schema'))

    await expect(
      program.parseAsync(['node', 'specd', 'schema', 'extend', 'nonexistent', 'my-ext']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })

  it('exits with code 1 when source is a schema-plugin', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue({
      data: { name: 'my-plugin', kind: 'schema-plugin' as const, version: 1 },
      templates: new Map(),
      resolvedPath: '/fake/node_modules/@specd/my-plugin/schema.yaml',
    } satisfies SchemaRawResult)

    const program = makeProgram()
    registerSchemaExtend(program.command('schema'))

    await expect(
      program.parseAsync(['node', 'specd', 'schema', 'extend', '@specd/my-plugin', 'my-ext']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/schema-plugin/)
  })

  it('exits with code 1 when workspace has no schemasPath', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue(mockRaw)

    const program = makeProgram()
    registerSchemaExtend(program.command('schema'))

    await expect(
      program.parseAsync(['node', 'specd', 'schema', 'extend', '@specd/schema-std', 'my-ext']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/no schemas directory/)
  })

  describe('extend with --output (real I/O)', () => {
    let tmpDir: string

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-extend-test-'))
    })

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true })
    })

    it('creates schema.yaml with correct name and extends content', async () => {
      const { kernel, stdout } = setup()
      vi.mocked(kernel.schemas.resolveRaw).mockResolvedValue(mockRaw)

      const outputDir = path.join(tmpDir, 'extended')

      const program = makeProgram()
      registerSchemaExtend(program.command('schema'))
      await program.parseAsync([
        'node',
        'specd',
        'schema',
        'extend',
        '@specd/schema-std',
        'my-extended-schema',
        '--output',
        outputDir,
      ])

      // Verify directory and schema.yaml were created
      const stat = await fs.stat(outputDir)
      expect(stat.isDirectory()).toBe(true)

      const content = await fs.readFile(path.join(outputDir, 'schema.yaml'), 'utf-8')
      expect(content).toContain('kind: schema')
      expect(content).toContain('name: my-extended-schema')
      expect(content).toContain("extends: '@specd/schema-std'")
      expect(content).toContain('artifacts: []')

      expect(stdout()).toContain(outputDir)
    })
  })
})
