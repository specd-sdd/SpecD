import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  publicApiHref,
  isApiReferenceEnabled,
  generatedApiPath,
  publicDocsHref,
  publicDocsExclude,
  publicDocsPath,
  publicGithubHref,
  publicSiteTagline,
  publicSiteTitle,
} from './src/lib/public-docs-config.js'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const docsSidebarPath = path.join(currentDirPath, 'sidebars.ts')
const apiSidebarPath = path.join(currentDirPath, 'api-sidebars.ts')
const customCssPath = path.join(currentDirPath, 'src/css/custom.css')
const apiReferenceEnabled = isApiReferenceEnabled()

const classicPresetOptions: Preset.Options = {
  docs: {
    path: publicDocsPath,
    routeBasePath: 'docs',
    sidebarPath: docsSidebarPath,
    exclude: [...publicDocsExclude],
  },
  blog: false,
  theme: {
    customCss: customCssPath,
  },
}

const themeConfig: Preset.ThemeConfig = {
  image: 'img/og-card.svg',
  colorMode: {
    defaultMode: 'dark',
    disableSwitch: true,
    respectPrefersColorScheme: false,
  },
  navbar: {
    logo: {
      alt: 'SpecD',
      src: 'img/logo-mark.svg',
    },
    title: publicSiteTitle,
    items: [
      { label: 'Docs', to: publicDocsHref },
      ...(apiReferenceEnabled ? [{ label: 'API', to: publicApiHref }] : []),
      {
        href: publicGithubHref,
        label: 'GitHub',
        position: 'right',
        className: 'navbar-github-link',
      },
    ],
  },
  footer: {
    style: 'dark',
    links: [
      {
        title: 'Site',
        items: [
          { label: 'Docs', to: publicDocsHref },
          ...(apiReferenceEnabled ? [{ label: 'API', to: publicApiHref }] : []),
        ],
      },
      {
        title: 'Project',
        items: [{ label: 'GitHub', href: publicGithubHref }],
      },
    ],
  },
}

const config: Config = {
  title: publicSiteTitle,
  tagline: publicSiteTagline,
  favicon: 'img/logo-mark.png',
  url: 'https://getspecd.dev',
  baseUrl: '/',
  customFields: {
    apiReferenceEnabled,
  },
  organizationName: 'specd',
  projectName: 'specd',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [['classic', classicPresetOptions]],
  plugins: apiReferenceEnabled
    ? [
        [
          '@docusaurus/plugin-content-docs',
          {
            id: 'api',
            path: generatedApiPath,
            routeBasePath: 'api',
            sidebarPath: apiSidebarPath,
          },
        ],
      ]
    : [],
  themeConfig,
}

export default config
