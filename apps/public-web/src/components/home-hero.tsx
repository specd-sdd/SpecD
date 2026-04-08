import React from 'react'
import {
  publicApiHref,
  publicDocsHref,
  publicGithubHref,
  publicHeroImageHref,
} from '../lib/public-docs-config'

/**
 * Lightweight metadata for a primary homepage action.
 */
export interface HomeHeroAction {
  /**
   * Human-readable action label.
   */
  readonly label: string

  /**
   * Absolute or site-relative destination for the action.
   */
  readonly href: string

  /**
   * Visual treatment used by the homepage button.
   */
  readonly tone: 'primary' | 'secondary'
}

/**
 * Social or navigation link exposed near the hero copy.
 */
export interface HomeHeroLink {
  /**
   * Accessible label rendered next to the icon.
   */
  readonly label: string

  /**
   * Link destination for the project surface.
   */
  readonly href: string

  /**
   * Inline SVG icon used for the link.
   */
  readonly icon: JSX.Element
}

const baseProjectLinks: readonly HomeHeroLink[] = [
  {
    label: 'GitHub',
    href: publicGithubHref,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M12 2C6.477 2 2 6.589 2 12.249c0 4.529 2.865 8.371 6.839 9.727.5.095.683-.221.683-.492 0-.242-.009-.885-.014-1.738-2.782.62-3.369-1.37-3.369-1.37-.455-1.184-1.111-1.498-1.111-1.498-.908-.635.069-.622.069-.622 1.004.072 1.532 1.054 1.532 1.054.892 1.563 2.341 1.111 2.91.85.091-.663.35-1.111.637-1.366-2.221-.259-4.555-1.139-4.555-5.068 0-1.119.389-2.035 1.029-2.752-.103-.259-.446-1.302.097-2.714 0 0 .84-.275 2.75 1.051A9.348 9.348 0 0 1 12 6.835c.85.004 1.705.117 2.504.344 1.909-1.326 2.748-1.051 2.748-1.051.545 1.412.201 2.455.099 2.714.641.717 1.027 1.633 1.027 2.752 0 3.939-2.338 4.806-4.566 5.06.359.318.678.946.678 1.907 0 1.376-.012 2.486-.012 2.824 0 .273.18.592.688.491C19.138 20.616 22 16.775 22 12.249 22 6.589 17.523 2 12 2Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    label: 'Docs',
    href: publicDocsHref,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M6 3.75A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6Zm1.5 3h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5Zm0 4h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5Zm0 4H13a.75.75 0 0 1 0 1.5H7.5a.75.75 0 0 1 0-1.5Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
]

const apiProjectLink: HomeHeroLink = {
  label: 'API',
  href: publicApiHref,
  icon: (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M8.25 4.5A2.25 2.25 0 0 0 6 6.75v2.01a3.746 3.746 0 0 0 0 6.48v2.01a2.25 2.25 0 1 0 1.5 0v-2.01a3.746 3.746 0 0 0 2.76-2.49h3.48a3.746 3.746 0 0 0 2.76 2.49v2.01a2.25 2.25 0 1 0 1.5 0v-2.01a3.75 3.75 0 0 0 0-6.48V6.75a2.25 2.25 0 1 0-1.5 0v2.01a3.746 3.746 0 0 0-2.76 2.49h-3.48A3.746 3.746 0 0 0 7.5 8.76V6.75a2.25 2.25 0 1 0 .75-2.25Zm8.25 1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5ZM7.5 11.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm9 0a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm-8.25 7.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm8.25 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"
        fill="currentColor"
      />
    </svg>
  ),
}

/**
 * Properties for the home hero component.
 */
export interface HomeHeroProps {
  /**
   * Whether the generated API section is mounted in the current site runtime.
   */
  readonly apiReferenceEnabled?: boolean
}

/**
 * Renders the hero section and primary project entrypoints for the public site.
 *
 * @param props - Home hero properties.
 * @param props.apiReferenceEnabled - Whether the generated API section is mounted in the current site runtime.
 * @returns Hero markup for the landing page.
 */
export function HomeHero({
  apiReferenceEnabled = true,
}: HomeHeroProps): JSX.Element {
  const primaryActions: readonly HomeHeroAction[] = apiReferenceEnabled
    ? [
        { label: 'Get Started', href: publicDocsHref, tone: 'primary' },
        { label: 'Browse API', href: publicApiHref, tone: 'secondary' },
      ]
    : [{ label: 'Get Started', href: publicDocsHref, tone: 'primary' }]

  const projectLinks: readonly HomeHeroLink[] = apiReferenceEnabled
    ? [...baseProjectLinks, apiProjectLink]
    : baseProjectLinks

  return (
    <section className="hero-panel">
      <div className="hero-stage">
        <div className="hero-copy">
          <p className="hero-kicker">Spec-first workflow</p>
          <p className="hero-product-mark">SpecD</p>
          <p className="hero-product-tagline">Spec-Driven Development</p>
          <h1>Build against intent before code starts drifting.</h1>
          <p className="hero-summary">
            SpecD compiles the exact context an agent needs for the current change and
            pairs it with a code graph for impact analysis, search, and hotspot
            discovery.
          </p>
          <div className="hero-actions">
            {primaryActions.map((action) => (
              <a
                key={action.label}
                className={`hero-action hero-action-${action.tone}`}
                href={action.href}
              >
                {action.label}
              </a>
            ))}
          </div>
          <ul className="hero-links" aria-label="Project links">
            {projectLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href}>
                  {link.icon}
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="hero-visual">
          <img
            className="hero-visual-image"
            src={publicHeroImageHref}
            alt="Spec workflow visual connecting documents, tasks, and validation."
          />
        </div>
      </div>
      <div className="hero-rail" aria-label="Workflow overview">
        <div className="signal-card">
          <p>Why teams adopt it</p>
          <strong>Specs stay readable, reviewable, and enforceable.</strong>
        </div>
        <ol className="workflow-steps">
          <li>
            <span>01</span>
            <div>
              <strong>Define the change</strong>
              <p>Capture requirements and verification before implementation starts.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Design with traceability</strong>
              <p>Proposal, design, and tasks stay attached to the same change.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Implement and verify</strong>
              <p>Agents execute against the spec instead of improvising from prompts.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}
