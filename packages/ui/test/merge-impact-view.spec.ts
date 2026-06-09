import { describe, expect, it } from 'vitest'
import {
  buildImpactViewModel,
  implementationFileMatchesGraphTarget,
} from '../src/change/merge-impact-view.js'

describe('implementationFileMatchesGraphTarget', () => {
  it('matches workspace path suffix to manifest file', () => {
    expect(
      implementationFileMatchesGraphTarget(
        'packages/ui/src/change/ChangeTabPanels.tsx',
        'ui:src/change/ChangeTabPanels.tsx',
      ),
    ).toBe(true)
  })
})

describe('buildImpactViewModel', () => {
  it('groups accepted links and graph-only coverage per spec', () => {
    const model = buildImpactViewModel(
      {
        links: [
          {
            specId: 'ui:change-tab-impact',
            file: 'packages/ui/src/change/ChangeTabPanels.tsx',
            fileLinkExplicit: true,
            symbols: ['ChangeImpactTab'],
          },
        ],
        trackedFiles: [],
      },
      {
        changeName: 'specd-studio',
        specIds: ['ui:change-tab-impact', 'ui:shell-layout'],
        specs: [
          {
            specId: 'ui:change-tab-impact',
            coveredFiles: ['ui:src/change/ChangeTabPanels.tsx', 'ui:src/other.ts'] as any,
            coveredSymbols: ['ChangeImpactTab'] as any,
          },
          {
            specId: 'ui:shell-layout',
            coveredFiles: ['ui:src/shell/ShellLayout.tsx'] as any,
            coveredSymbols: [],
          },
        ],
      },
      ['ui:change-tab-impact', 'ui:shell-layout'],
    )

    expect(model.bySpec).toHaveLength(2)
    const impact = model.bySpec.find((g) => g.specId === 'ui:change-tab-impact')
    expect(impact?.accepted).toHaveLength(1)
    expect(impact?.accepted[0]!.graphFiles).toContain('ui:src/change/ChangeTabPanels.tsx')
    expect(impact?.graphOnlyFiles).toContain('ui:src/other.ts')
    const shell = model.bySpec.find((g) => g.specId === 'ui:shell-layout')
    expect(shell?.accepted).toHaveLength(0)
    expect(shell?.graphOnlyFiles).toContain('ui:src/shell/ShellLayout.tsx')
  })

  it('assigns tracked files to a spec when uniquely matched', () => {
    const model = buildImpactViewModel(
      {
        links: [
          {
            specId: 'ui:change-tab-impact',
            file: 'packages/ui/src/foo.ts',
            fileLinkExplicit: true,
          },
        ],
        trackedFiles: [
          { file: 'packages/ui/src/foo.ts', state: 'open' },
          { file: 'packages/core/other.ts', state: 'resolved' },
        ],
      },
      undefined,
      ['ui:change-tab-impact'],
    )

    const impact = model.bySpec.find((g) => g.specId === 'ui:change-tab-impact')
    expect(impact?.tracked.open).toHaveLength(1)
    expect(model.trackedUnassigned.resolved).toHaveLength(1)
  })
})
