import React from 'react'
import {
  publicApiHref,
  publicDocsHref,
  publicGithubHref,
} from '../lib/public-docs-config'
import { HomeFeatures } from './home-features'
import { HomeHero } from './home-hero'

/**
 * Properties for the public landing page shell.
 */
export interface LandingPageProps {
  /**
   * Whether the generated API section is mounted in the current site runtime.
   */
  readonly apiReferenceEnabled?: boolean
}

/**
 * Composes the public-facing homepage outside the Docusaurus docs index.
 *
 * @param props - Landing page properties.
 * @param props.apiReferenceEnabled - Whether the generated API section is mounted in the current site runtime.
 * @returns Landing page section tree.
 */
export function LandingPage({
  apiReferenceEnabled = true,
}: LandingPageProps): JSX.Element {
  return (
    <main className="landing-shell">
      <HomeHero apiReferenceEnabled={apiReferenceEnabled} />
      <HomeFeatures />
      <section className="cta-band" aria-labelledby="cta-heading">
        <div className="section-heading">
          <p>Start from the right entrypoint</p>
          <h2 id="cta-heading">Use the site the same way you would use the project.</h2>
        </div>
        <div className="cta-grid">
          <a className="cta-card" href={publicDocsHref}>
            <span>Read the docs</span>
            <strong>Getting started, workflow, configuration, and public concepts.</strong>
          </a>
          {apiReferenceEnabled ? (
            <a className="cta-card" href={publicApiHref}>
              <span>Browse the API</span>
              <strong>
                Generated reference for the exported `@specd/core` surface.
              </strong>
            </a>
          ) : null}
          <a className="cta-card" href={publicGithubHref}>
            <span>Inspect the repo</span>
            <strong>See the monorepo, code graph tooling, CLI, and the specs that drive the workflow.</strong>
          </a>
        </div>
      </section>
    </main>
  )
}
