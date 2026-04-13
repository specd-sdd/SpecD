/**
 * Human-readable site title for the public web app.
 */
export const publicSiteTitle = 'SpecD'

/**
 * Short tagline used across the public site metadata and homepage.
 */
export const publicSiteTagline = 'Spec-Driven Development for real codebases.'

/**
 * SEO-focused homepage title fragment used in document metadata.
 */
export const publicHomePageTitle = 'Spec-Driven Development for real codebases'

/**
 * SEO-focused homepage description used in search and social previews.
 */
export const publicSiteDescription =
  'SpecD compiles agent context, analyzes code impact, and keeps design, review, and verification attached to each change.'

/**
 * Canonical public site origin.
 */
export const publicSiteUrl = 'https://getspecd.dev'

/**
 * Social preview image for the public site.
 */
export const publicSocialImageHref = '/img/og-card.svg'

/**
 * Canonical repository URL exposed from the public site.
 */
export const publicGithubHref = 'https://github.com/specd-sdd/SpecD'

/**
 * Primary public docs route promoted from the landing page.
 */
export const publicDocsHref = '/docs/guide/getting-started'

/**
 * Dedicated public API reference route.
 */
export const publicApiHref = '/api'

/**
 * Static asset path for the homepage hero artwork.
 */
export const publicHeroImageHref = '/img/hero-image.png'

/**
 * Environment variable used to disable the generated API reference during development.
 */
export const publicApiDisableEnvVar = 'SPECD_PUBLIC_WEB_DISABLE_API'

/**
 * Repository-authored documentation root consumed by the public site.
 */
export const publicDocsPath = '../../docs'

/**
 * Documentation paths that must stay out of the public site.
 */
export const publicDocsExclude = ['adr/**'] as const

/**
 * Generated API docs output path within the public-web workspace.
 */
export const generatedApiPath = '.generated/api'

/**
 * Initial package entrypoints used to derive the public API reference.
 */
export const initialApiEntryPoints = ['../../packages/core/src/index.ts'] as const

/**
 * Returns whether the generated API reference should be mounted for the current process.
 *
 * Development disables the API docs plugin because watching hundreds of generated markdown
 * files causes Docusaurus to exceed the open-file limit on macOS.
 *
 * @param env Process environment to inspect.
 * @returns `true` when the site should mount the generated API reference.
 */
export function isApiReferenceEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = getDefaultEnv(),
): boolean {
  return env[publicApiDisableEnvVar] !== '1'
}

/**
 * Resolves a process-like environment object when one exists, or an empty object in the browser.
 *
 * @returns A safe environment map for both Node and browser execution.
 */
function getDefaultEnv(): NodeJS.ProcessEnv | Record<string, string | undefined> {
  if (typeof process === 'undefined') {
    return {}
  }

  return process.env
}
