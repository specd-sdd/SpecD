import config from '../../docusaurus.config'
import { describe, expect, it } from 'vitest'

describe('docusaurus config', () => {
  it('locks the site to the dark theme without a day-mode switch', () => {
    expect(config.themeConfig?.colorMode).toEqual({
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    })
  })

  it('shows the SpecD title with the site icon in the navbar brand', () => {
    const navbar = config.themeConfig?.navbar as
      | {
          readonly title?: string
          readonly logo?: {
            readonly alt: string
            readonly src: string
          }
        }
      | undefined

    expect(navbar?.title).toBe('SpecD')
    expect(navbar?.logo).toEqual({
      alt: 'SpecD',
      src: 'img/logo-mark.svg',
    })
  })
})
