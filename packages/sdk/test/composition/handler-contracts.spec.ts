import { describe, expect, expectTypeOf, it } from 'vitest'
import type { KernelBuilder } from '@specd/core/extensions'
import type { ContributionActivationContext, ContributionKindHandler } from '@specd/plugin-manager'
import type { SpecdPlugin } from '@specd/plugin-manager'
import type {
  ContributionActivationContext as SdkActivationContext,
  ContributionKindHandler as SdkKindHandler,
  SdkContextOptions,
} from '../../src/index.js'

describe('SDK handler contracts (type level)', () => {
  it('given the SDK barrel, when handler types are imported, then they are the plugin-manager contracts', () => {
    expectTypeOf<SdkKindHandler>().toEqualTypeOf<ContributionKindHandler>()
    expectTypeOf<SdkActivationContext>().toEqualTypeOf<ContributionActivationContext>()
    expect(true).toBe(true)
  })

  it('given ContributionKindHandler, when its shape is inspected, then it has kind, blockSchema and optional hooks', () => {
    expectTypeOf<SdkKindHandler['kind']>().toEqualTypeOf<string>()
    expectTypeOf<SdkKindHandler>().toHaveProperty('blockSchema')
    expectTypeOf<SdkKindHandler['activate']>().toEqualTypeOf<
      ((ctx: SdkActivationContext) => void | Promise<void>) | undefined
    >()
    expectTypeOf<SdkActivationContext['builder']>().toEqualTypeOf<KernelBuilder>()
    expectTypeOf<SdkActivationContext['plugin']>().toEqualTypeOf<SpecdPlugin>()
    expectTypeOf<SdkActivationContext['contributions']>().toEqualTypeOf<
      ReadonlyMap<string, unknown>
    >()
    expect(true).toBe(true)
  })

  it('given SdkContextOptions, when pluginHandlers is inspected, then it accepts contribution kind handlers', () => {
    expectTypeOf<NonNullable<SdkContextOptions['pluginHandlers']>>().toEqualTypeOf<
      readonly SdkKindHandler[]
    >()
    expectTypeOf<SdkContextOptions['plugins']>().toEqualTypeOf<boolean | undefined>()
    expect(true).toBe(true)
  })
})
