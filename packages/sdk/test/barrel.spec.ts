import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as sdk from '../src/index.js'

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
    expect(typeof sdk.createConfigLoader).toBe('function')
    expect(typeof sdk.createConfigWriter).toBe('function')
    expect(typeof sdk.createKernel).toBe('function')
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
})
