import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as sdk from '../src/index.js'
import * as sdkPorts from '../src/ports.js'
import * as sdkExtensions from '../src/extensions.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string
}

describe('@specd/sdk barrel', () => {
  it('exports SDK_VERSION matching package.json', () => {
    expect(sdk.SDK_VERSION).toBe(packageJson.version)
  })

  it('exports host bootstrap and orchestration symbols', () => {
    expect(typeof sdk.openSpecdHost).toBe('function')
    expect(typeof sdk.createSdkContext).toBe('function')
    expect(typeof sdk.withOpenGraphProvider).toBe('function')
    expect(typeof sdk.buildProjectStatusSnapshot).toBe('function')
    expect(typeof sdk.runIndexProjectGraph).toBe('function')
  })

  it('re-exports core bootstrap factories', () => {
    expect(typeof sdk.createDefaultConfigLoader).toBe('function')
    expect(typeof sdk.createConfigWriter).toBe('function')
    expect(typeof sdk.createKernel).toBe('function')
    expect(typeof sdk.createGetStatus).toBe('function')
    expect(typeof sdk.createSpecRepository).toBe('function')
  })

  it('does not use export star from @specd/core in the SDK index source', () => {
    const indexSource = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    expect(indexSource).not.toMatch(/export \* from '@specd\/core'/)
  })

  it('re-exports curated core surface via core-reexports', () => {
    expect(typeof sdk.createGetStatus).toBe('function')
    expect(typeof sdk.createSpecRepository).toBe('function')
    expect(typeof sdk.CORE_VERSION).toBe('string')
  })

  it('re-exports host-adapter code-graph symbols', () => {
    expect(typeof sdk.acquireGraphIndexLock).toBe('function')
    expect(typeof sdk.assertGraphIndexUnlocked).toBe('function')
    expect(typeof sdk.createGetGraphHealth).toBe('function')
    expect(typeof sdk.GraphSpecNotFoundError).toBe('function')
    expect(typeof sdk.codeGraphVersion).toBe('string')
    expect(typeof sdk.getCodeGraphVersion).toBe('function')
    expect(typeof sdk.CODE_GRAPH_VERSION).toBe('string')
    expect(sdk.codeGraphVersion).toBe(sdk.CODE_GRAPH_VERSION)
    expect(sdk.codeGraphVersion).not.toBe('0.0.0')
  })

  it('exports codeGraphVersion matching @specd/code-graph package.json', () => {
    const codeGraphPackageJson = JSON.parse(
      readFileSync(join(packageRoot, '../code-graph/package.json'), 'utf8'),
    ) as { version: string }
    expect(sdk.codeGraphVersion).toBe(codeGraphPackageJson.version)
    expect(sdk.getCodeGraphVersion()).toBe(codeGraphPackageJson.version)
  })

  it('does not export infrastructure implementation classes', () => {
    expect('FsConfigLoader' in sdk).toBe(false)
  })

  it('exposes core port contracts via /ports subpath', () => {
    expect(sdkPorts.ChangeRepository).toBeDefined()
    expect(sdkPorts.SpecRepository).toBeDefined()
    expect(typeof sdkPorts.ChangeRepository).toBe('function')
  })

  it('exposes core extensions via /extensions subpath', () => {
    expect(typeof sdkExtensions.createKernelBuilder).toBe('function')
    expect(sdkExtensions.RegistryConflictError).toBeDefined()
  })
})
