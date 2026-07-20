import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import * as os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as corePublic from '../src/public.js'
import * as corePorts from '../src/ports.js'
import * as coreExtensions from '../src/extensions.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('@specd/core public barrel', () => {
  let tmpDir: string
  let specsPath: string
  let metadataPath: string

  beforeAll(() => {
    const parentTmp = os.tmpdir()
    const folder = `specd-barrel-test-${Math.random().toString(36).slice(2, 8)}`
    tmpDir = resolve(parentTmp, folder)
    specsPath = resolve(tmpDir, 'specs')
    metadataPath = resolve(tmpDir, 'metadata')
    mkdirSync(specsPath, { recursive: true })
    mkdirSync(metadataPath, { recursive: true })
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('exports CORE_VERSION matching package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(corePublic.CORE_VERSION).toBe(packageJson.version)
  })

  it('does not export concrete filesystem adapters on the public root', () => {
    expect('FsSpecRepository' in corePublic).toBe(false)
    expect('FsConfigLoader' in corePublic).toBe(false)
    expect('GitVcsAdapter' in corePublic).toBe(false)
  })

  it('exports bootstrap and repository factories on the public root', () => {
    expect(typeof corePublic.createKernel).toBe('function')
    expect(typeof corePublic.createGetStatus).toBe('function')
    expect(typeof corePublic.createArchiveChange).toBe('function')
    expect(typeof corePublic.createSpecRepository).toBe('function')
    expect(typeof corePublic.createChangeRepository).toBe('function')
    expect(typeof corePublic.createArchiveRepository).toBe('function')
  })

  it('exports the VCS adapter port on the public root as a runtime value', () => {
    expect(typeof corePublic.VcsAdapter).toBe('function')
    expect(corePorts.VcsAdapter).toBe(corePublic.VcsAdapter)
  })

  it('constructs a change repository without createKernel', () => {
    const repo = corePublic.createSpecRepository(
      'fs',
      {
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: resolve(tmpDir, 'specd.yaml'),
      },
      { specsPath, metadataPath },
    )
    expect(repo).toBeDefined()
    expect(typeof repo.list).toBe('function')
  })

  it('exposes port contracts on ./ports', () => {
    expect(corePorts.ChangeRepository).toBeDefined()
    expect(corePorts.SpecRepository).toBeDefined()
    expect('FsSpecRepository' in corePorts).toBe(false)
  })

  it('exposes extension registration on ./extensions', () => {
    expect(typeof coreExtensions.createKernelBuilder).toBe('function')
    expect(coreExtensions.RegistryConflictError).toBeDefined()
    expect('BUILTIN_ACTOR_PROVIDERS' in coreExtensions).toBe(false)
  })
})
