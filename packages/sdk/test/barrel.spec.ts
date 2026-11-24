import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import * as corePorts from '@specd/core/ports'
import type { ChangeRepository as CoreChangeRepository } from '@specd/core/ports'
import type { ChangeRepository as SdkChangeRepository } from '../src/ports.js'
import * as core from '@specd/core'
import * as sdk from '../src/index.js'
import * as sdkPorts from '../src/ports.js'
import * as sdkExtensions from '../src/extensions.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string
  exports: Record<string, unknown>
}
const publishShapedWorkerConsumer = join(
  packageRoot,
  'test/fixtures/publish-shaped-worker-consumer.ts',
)

/**
 * `execFileSync('pnpm')` cannot resolve `pnpm.cmd` unless Windows uses a shell.
 *
 * Only used to typecheck against an already-built `dist/`; this suite never builds.
 */
function runPnpm(args: readonly string[], cwd: string): void {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  execFileSync(command, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    windowsHide: true,
  })
}

/** True when a built package entrypoint exists; built-artifact checks are skipped otherwise. */
const hasBuiltDist =
  existsSync(join(packageRoot, 'dist/index.js')) && existsSync(join(packageRoot, 'dist/index.d.ts'))

describe('@specd/sdk barrel', () => {
  it('exports SDK_VERSION matching package.json', () => {
    expect(sdk.SDK_VERSION).toBe(packageJson.version)
  })

  it('exports the context markdown presentation helpers', () => {
    expect(typeof sdk.changeContextToMarkdown).toBe('function')
    expect(typeof sdk.projectContextToMarkdown).toBe('function')
  })

  it('exports host bootstrap and orchestration symbols', () => {
    expect(typeof sdk.openSpecdHost).toBe('function')
    expect(typeof sdk.createSdkContext).toBe('function')
    expect(typeof sdk.withOpenGraphProvider).toBe('function')
    expect(typeof sdk.buildImplementationReview).toBe('function')
    expect(typeof sdk.buildProjectStatusSnapshot).toBe('function')
    expect(typeof sdk.runIndexProjectGraph).toBe('function')
    expect(typeof sdk.runGraphSearch).toBe('function')
    expect(typeof sdk.runGraphHotspots).toBe('function')
    expect(typeof sdk.runGraphImpact).toBe('function')
    expect(typeof sdk.toProjectRelativePath).toBe('function')
    expect(typeof sdk.toGraphDisplayPath).toBe('function')
    expect(typeof sdk.splitWorkspaceIdentity).toBe('function')
  })

  it('re-exports core bootstrap factories', () => {
    expect(typeof sdk.createDefaultConfigLoader).toBe('function')
    expect(typeof sdk.createConfigWriter).toBe('function')
    expectTypeOf<sdk.ConfigWriter>().toEqualTypeOf<core.ConfigWriter>()
    expectTypeOf<sdk.AddPluginOptions>().toEqualTypeOf<core.AddPluginOptions>()
    expectTypeOf<sdk.ConfigDeclaredPlugin>().toEqualTypeOf<core.ConfigDeclaredPlugin>()
    expectTypeOf<sdk.ConfigWriter>().not.toBeAny()
    expect(typeof sdk.createKernel).toBe('function')
    expect(typeof sdk.isPluginName).toBe('function')
    expect(sdk.PLUGIN_NAME_REGEX).toBeDefined()
    expect(typeof sdk.LegacyConfigFormatError).toBe('function')
    expect(typeof sdk.UnsupportedConfigVersionError).toBe('function')
    expect(typeof sdk.createGetStatus).toBe('function')
    expect(typeof sdk.createSpecRepository).toBe('function')
  })

  it('re-exports CheckAction ABI and host-neutral lifecycle guidance types', () => {
    expect(typeof sdk.approveSpecAction).toBe('function')
    expect(typeof sdk.approveSignoffAction).toBe('function')
    expect(typeof sdk.startVerificationAction).toBe('function')
    expect(typeof sdk.refreshStatusAction).toBe('function')
    expectTypeOf<sdk.CheckAction>().toEqualTypeOf<core.CheckAction>()
    expectTypeOf<sdk.BuiltInCheckActionKind>().toEqualTypeOf<core.BuiltInCheckActionKind>()
    expectTypeOf<sdk.LifecycleActionIntent>().toEqualTypeOf<core.LifecycleActionIntent>()
    expectTypeOf<sdk.NextAction>().toEqualTypeOf<core.NextAction>()
    expectTypeOf<sdk.Blocker>().toEqualTypeOf<core.Blocker>()
    expectTypeOf<sdk.LifecycleNextAction>().toEqualTypeOf<core.LifecycleNextAction>()
    expectTypeOf<sdk.LifecycleBlocker>().toEqualTypeOf<core.LifecycleBlocker>()
    expectTypeOf<sdk.CheckResult>().toEqualTypeOf<core.CheckResult>()
    expectTypeOf<sdk.AutomaticRecovery>().toEqualTypeOf<core.AutomaticRecovery>()
    expectTypeOf<sdk.ChangeValidityVerdict>().toEqualTypeOf<core.ChangeValidityVerdict>()
    expectTypeOf<sdk.ArtifactReviewTarget>().toEqualTypeOf<core.ArtifactReviewTarget>()
    expectTypeOf<sdk.ProjectionChange>().toEqualTypeOf<core.ProjectionChange>()
    expectTypeOf<sdk.ValidityBlocker>().toEqualTypeOf<core.ValidityBlocker>()
    expectTypeOf<sdk.FingerprintInputFailure>().toEqualTypeOf<core.FingerprintInputFailure>()
    expectTypeOf<sdk.ProjectionStatus>().toEqualTypeOf<core.ProjectionStatus>()
    expectTypeOf<sdk.InvalidatedArtifactEntry>().toEqualTypeOf<core.InvalidatedArtifactEntry>()
    expectTypeOf<sdk.ArchiveFailedEvent>().toEqualTypeOf<core.ArchiveFailedEvent>()
    expectTypeOf<sdk.ArchiveFailureStep>().toEqualTypeOf<core.ArchiveFailureStep>()
    expectTypeOf<sdk.DescriptionUpdatedEvent>().toEqualTypeOf<core.DescriptionUpdatedEvent>()
    expectTypeOf<sdk.ApprovalInvalidatedEvent>().toEqualTypeOf<core.ApprovalInvalidatedEvent>()
    expectTypeOf<sdk.VerificationAttemptStartedEvent>().toEqualTypeOf<core.VerificationAttemptStartedEvent>()
    expectTypeOf<sdk.VerificationCompletedEvent>().toEqualTypeOf<core.VerificationCompletedEvent>()
    expectTypeOf<sdk.VerificationInvalidatedEvent>().toEqualTypeOf<core.VerificationInvalidatedEvent>()
    expectTypeOf<sdk.ValidityStatusProjection>().toEqualTypeOf<core.ValidityStatusProjection>()
    expectTypeOf<sdk.ApprovalStatusProjection>().toEqualTypeOf<core.ApprovalStatusProjection>()
    expectTypeOf<sdk.VerificationStatusProjection>().toEqualTypeOf<core.VerificationStatusProjection>()
    expectTypeOf<sdk.ProjectionInvalidation>().toEqualTypeOf<core.ProjectionInvalidation>()
    expectTypeOf<sdk.ValidityInvalidationCause>().toEqualTypeOf<core.ValidityInvalidationCause>()
    expectTypeOf<sdk.FingerprintDifference>().toEqualTypeOf<core.FingerprintDifference>()
    expectTypeOf<sdk.ValidityFingerprint>().toEqualTypeOf<core.ValidityFingerprint>()
    expectTypeOf<sdk.InvalidationPolicyOverride>().toEqualTypeOf<core.InvalidationPolicyOverride>()
    expectTypeOf<sdk.ApprovalDecision>().toEqualTypeOf<core.ApprovalDecision>()
    expectTypeOf<sdk.VerificationAttempt>().toEqualTypeOf<core.VerificationAttempt>()
    expectTypeOf<sdk.CompletedVerification>().toEqualTypeOf<core.CompletedVerification>()
    expectTypeOf<sdk.ArtifactFileStatus>().toEqualTypeOf<core.ArtifactFileStatus>()
    expectTypeOf<sdk.ReviewArtifactSummary>().toEqualTypeOf<core.ReviewArtifactSummary>()
    expectTypeOf<sdk.ReviewArtifactFileSummary>().toEqualTypeOf<core.ReviewArtifactFileSummary>()
    expectTypeOf<sdk.CheckOutcome>().toEqualTypeOf<core.CheckOutcome>()
    expectTypeOf<sdk.ArtifactInvalidationPolicy>().toEqualTypeOf<core.ArtifactInvalidationPolicy>()
    expectTypeOf<sdk.WorkflowInvalidationPolicy>().toEqualTypeOf<core.WorkflowInvalidationPolicy>()
    expectTypeOf<sdk.SpecApprovalFingerprint>().toEqualTypeOf<core.SpecApprovalFingerprint>()
    expectTypeOf<sdk.ArtifactFingerprint>().toEqualTypeOf<core.ArtifactFingerprint>()
    expectTypeOf<sdk.ImplementationFingerprint>().toEqualTypeOf<core.ImplementationFingerprint>()
    expectTypeOf<sdk.InvalidateChangeResult>().toEqualTypeOf<core.InvalidateChangeResult>()
    expectTypeOf<sdk.ReconcileChangeValidityResult>().toEqualTypeOf<core.ReconcileChangeValidityResult>()
  })

  it('re-exports plugin error classes from the same module as plugin-manager', async () => {
    const pluginManager = await import('@specd/plugin-manager')
    expect(sdk.PluginInitError).toBe(pluginManager.PluginInitError)
    expect(sdk.PluginDestroyError).toBe(pluginManager.PluginDestroyError)
    expect(sdk.PluginValidationError).toBe(pluginManager.PluginValidationError)
    for (const name of [
      'PluginInitError',
      'PluginDestroyError',
      'PluginNotFoundError',
      'PluginValidationError',
      'DuplicateHandlerKindError',
      'InvalidContributionAddressError',
      'DuplicateContributionError',
      'UnknownContributionError',
      'UnknownContributionKindError',
      'InvalidPluginConfigError',
      'UnsupportedSchemaKeywordError',
    ] as const) {
      expect(sdk[name], name).toBe(pluginManager[name])
    }
  })

  it('re-exports plugin handler types and error classes', () => {
    expect(typeof sdk.PluginInitError).toBe('function')
    expect(typeof sdk.PluginDestroyError).toBe('function')
    expect(typeof sdk.PluginNotFoundError).toBe('function')
    expect(typeof sdk.PluginValidationError).toBe('function')
    expect(typeof sdk.DuplicateHandlerKindError).toBe('function')
    expect(typeof sdk.InvalidContributionAddressError).toBe('function')
    expect(typeof sdk.DuplicateContributionError).toBe('function')
    expect(typeof sdk.UnknownContributionError).toBe('function')
    expect(typeof sdk.UnknownContributionKindError).toBe('function')
    expect(typeof sdk.InvalidPluginConfigError).toBe('function')
    expect(typeof sdk.UnsupportedSchemaKeywordError).toBe('function')
    const indexSource = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    expect(indexSource).toContain('ContributionKindHandler')
    expect(indexSource).toContain('ContributionActivationContext')
  })

  it('does not use export star from @specd/core in the SDK index source', () => {
    const indexSource = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    expect(indexSource).not.toMatch(/export \* from '@specd\/core'/)
  })

  it('re-exports curated core surface via core-reexports', () => {
    expect(typeof sdk.createGetStatus).toBe('function')
    expect(typeof sdk.createSpecRepository).toBe('function')
    expect(typeof sdk.CORE_VERSION).toBe('string')
    expect(typeof sdk.createMaterializeSpecMetadata).toBe('function')
    expect(typeof sdk.createGetSpecMetadata).toBe('function')
    expect(typeof sdk.createInitializePersistedSpecState).toBe('function')
    expect(typeof sdk.createStartVerification).toBe('function')
    expect(typeof sdk.createCompleteVerification).toBe('function')
    expect(typeof sdk.createInvalidateVerification).toBe('function')
    expect(typeof sdk.createReconcileChangeValidity).toBe('function')
    expect('NodeBinaryContentHasher' in sdk).toBe(false)
    expect(typeof sdk.createUpdatePersistedSpecDeps).toBe('function')
    expect(typeof sdk.createRegenerateSpecMetadata).toBe('function')
    expect('createSaveSpecMetadata' in sdk).toBe(false)
    expect('createUpdateSpecMetadata' in sdk).toBe(false)
    expect('createInvalidateSpecMetadata' in sdk).toBe(false)
  })

  it('does not restore removed metadata mutation APIs in source or built declarations', () => {
    const removed = [
      'SaveSpecMetadata',
      'UpdateSpecMetadata',
      'InvalidateSpecMetadata',
      'PersistSpecMetadata',
    ]
    for (const name of removed) {
      expect(`create${name}` in sdk, name).toBe(false)
      expect(name in sdk, name).toBe(false)
    }
    const sources = [
      readFileSync(join(packageRoot, 'src/index.ts'), 'utf8'),
      readFileSync(join(packageRoot, 'src/core-reexports.ts'), 'utf8'),
    ]
    const declarations = join(packageRoot, 'dist/index.d.ts')
    if (existsSync(declarations)) sources.push(readFileSync(declarations, 'utf8'))
    for (const source of sources) {
      for (const name of removed) {
        expect(source).not.toMatch(new RegExp(`\\b(?:create)?${name}\\b`))
      }
    }
    // Type names of the surviving surface stay exported.
    const reexports = sources[1] ?? ''
    for (const name of ['MaterializeSpecMetadata', 'RegenerateSpecMetadata']) {
      expect(reexports).toMatch(new RegExp(`\\b${name}\\b`))
    }
  })

  it('re-exports InvalidCheckIdError as the same class as @specd/core', () => {
    expect(typeof sdk.InvalidCheckIdError).toBe('function')
    expect(sdk.InvalidCheckIdError).toBe(core.InvalidCheckIdError)
  })

  it('re-exports the core errors and registries it documents with core identity', () => {
    for (const name of ['ConfigNotFoundError', 'CheckRegistry', 'createKernel'] as const) {
      expect(sdk[name], name).toBe(core[name])
    }
  })

  it('exports the spec-metadata use-case classes as types only, factories as values', () => {
    // Design decision: the use-case classes (MaterializeSpecMetadata, GetSpecMetadata,
    // RegenerateSpecMetadata, InitializePersistedSpecState) are type-only re-exports;
    // consumers obtain behavior through the create* factories (values).
    for (const name of [
      'MaterializeSpecMetadata',
      'GetSpecMetadata',
      'RegenerateSpecMetadata',
      'InitializePersistedSpecState',
    ]) {
      expect(name in sdk, name).toBe(false)
      expect(typeof sdk[`create${name}` as keyof typeof sdk], `create${name}`).toBe('function')
    }
    const reexports = readFileSync(join(packageRoot, 'src/core-reexports.ts'), 'utf8')
    expect(reexports).toMatch(/type MaterializeSpecMetadata,/)
    expectTypeOf<sdk.MaterializeSpecMetadata>().not.toBeAny()
    expectTypeOf<sdk.GetSpecMetadata>().not.toBeAny()
    expectTypeOf<sdk.RegenerateSpecMetadata>().not.toBeAny()
    expectTypeOf<sdk.InitializePersistedSpecState>().not.toBeAny()
  })

  it('exposes no runtime kernel-wrapping API beyond the documented bootstrap set', () => {
    const suspicious = Object.keys(sdk)
      .filter((name) => /kernel|host|sdkcontext/i.test(name))
      .sort()
    expect(suspicious).toEqual(['createKernel', 'createSdkContext', 'openSpecdHost'])
  })

  it('re-exports host-adapter code-graph symbols', () => {
    expect(typeof sdk.createGetGraphHealth).toBe('function')
    expect(typeof sdk.GraphProviderStaleError).toBe('function')
    expect(typeof sdk.GraphSpecNotFoundError).toBe('function')
    expect(typeof sdk.codeGraphVersion).toBe('string')
    expect(typeof sdk.getCodeGraphVersion).toBe('function')
    expect(typeof sdk.CODE_GRAPH_VERSION).toBe('string')
    expect(sdk.codeGraphVersion).toBe(sdk.CODE_GRAPH_VERSION)
    expect(sdk.codeGraphVersion).not.toBe('0.0.0')
  })

  it('re-exports the isolated worker without raw lock or IPC internals', () => {
    expect(typeof sdk.runIsolatedGraphIndex).toBe('function')
    for (const name of [
      'acquireGraphIndexLock',
      'assertGraphIndexUnlocked',
      'getGraphIndexLockPath',
      'getGraphIndexLockPathForStoragePath',
      'GraphIndexLockLease',
      'GraphIndexLockLeaseOptions',
      'createGraphIndexLockHandoffEnv',
      'isGraphIndexLockHandoffForStoragePath',
      'StartMessage',
      'ChildMessage',
      'NodeIsolatedGraphIndexRunner',
    ]) {
      expect(name in sdk).toBe(false)
    }
    const source = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    expect(source).toContain('runIsolatedGraphIndex')
    expect(source).not.toMatch(
      /acquireGraphIndexLock|GraphIndexLockLease|StartMessage|ChildMessage/,
    )
  })

  // Inspects the existing dist only (never builds: tests must not rewrite build output).
  it.skipIf(!hasBuiltDist)(
    'compiles every documented worker contract and failure from the built package entrypoint',
    () => {
      runPnpm(
        [
          'exec',
          'tsc',
          '--noEmit',
          '--target',
          'ES2022',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--strict',
          '--skipLibCheck',
          publishShapedWorkerConsumer,
        ],
        packageRoot,
      )
    },
    30_000,
  )

  it.skipIf(!hasBuiltDist)(
    'keeps lock, lease, release, token, and raw IPC declarations out of built SDK declarations',
    () => {
      const declaration = readFileSync(join(packageRoot, 'dist/index.d.ts'), 'utf8')
      for (const declarationName of [
        'acquireGraphIndexLock',
        'assertGraphIndexUnlocked',
        'getGraphIndexLockPath',
        'GraphIndexLockLease',
        'GraphIndexLockLeaseOptions',
        'createGraphIndexLockHandoffEnv',
        'isGraphIndexLockHandoffForStoragePath',
        'StartMessage',
        'ChildMessage',
      ]) {
        expect(declaration).not.toMatch(new RegExp(`\\b${declarationName}\\b`))
      }
      expect(declaration).not.toMatch(/GRAPH_INDEX_LOCK_(?:PATH|TOKEN|HANDOFF)/)
    },
  )

  it('permits the SDK domain and curated shared aliases without public internal subpaths', () => {
    expect(existsSync(join(packageRoot, 'src/domain'))).toBe(true)
    expect(existsSync(join(packageRoot, 'src/shared'))).toBe(true)
    expect(packageJson.exports['./domain']).toBeUndefined()
    expect(packageJson.exports['./shared']).toBeUndefined()
    expect(packageJson.exports['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts',
    })
    expect(typeof sdk.codeGraphVersion).toBe('string')
    expect(typeof sdk.getCodeGraphVersion).toBe('function')
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
    // Identity with core's ports entry point, plus type-level identity (enforced by tsc).
    expect(sdkPorts.ChangeRepository).toBe(corePorts.ChangeRepository)
    expect(sdkPorts.SpecRepository).toBe(corePorts.SpecRepository)
    expectTypeOf<SdkChangeRepository>().toEqualTypeOf<CoreChangeRepository>()
  })

  it('exposes core extensions via /extensions subpath', () => {
    expect(typeof sdkExtensions.createKernelBuilder).toBe('function')
    expect(sdkExtensions.RegistryConflictError).toBeDefined()
  })
})
