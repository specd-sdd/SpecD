import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ExitSentinel, captureStdout, makeProgram, mockProcessExit } from './helpers.js'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'

function makeIndexProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphIndex(graph)
  return program
}

describe('graph index integration', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir !== undefined) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('indexes a bootstrap repository through the real SDK path with --force', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'specd-graph-index-int-'))
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    mkdirSync(join(tmpDir, 'specs'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'metadata'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'changes'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'drafts'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'discarded'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'archive'), { recursive: true })
    mkdirSync(join(tmpDir, '.specd', 'config', 'schemas'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'index.ts'), 'export const value = 1\n')
    execSync('git init', { cwd: tmpDir })
    execSync('git config user.email test@example.com', { cwd: tmpDir })
    execSync('git config user.name Test User', { cwd: tmpDir })
    execSync('git add .', { cwd: tmpDir })
    execSync('git commit -m "init"', { cwd: tmpDir })

    const getStdout = captureStdout()
    mockProcessExit()

    const program = makeIndexProgram()
    try {
      await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', tmpDir, '--force'])
    } catch (error) {
      if (!(error instanceof ExitSentinel)) throw error
    }

    expect(getStdout()).toContain('Indexed')
    expect(getStdout()).toContain('discovered:')
  }, 120_000)
})
