import React from 'react'

/**
 * Single value proposition rendered in the homepage feature grid.
 */
export interface FeatureItem {
  /**
   * Short feature heading.
   */
  readonly title: string

  /**
   * Supporting explanation for the feature.
   */
  readonly body: string
}

const featureItems: readonly FeatureItem[] = [
  {
    title: 'Context compiled, not discovered',
    body: 'SpecD resolves scope, dependencies, rules, and constraints into the instruction block for the change being worked on.',
  },
  {
    title: 'Code graph for impact analysis',
    body: 'Index symbols and relationships across the repo so changes can start with real blast-radius analysis instead of guesswork.',
  },
  {
    title: 'Search symbols, files, and hotspots',
    body: 'Use the built-in graph to find relevant code, inspect hotspots, and move from specs to implementation with less hunting.',
  },
  {
    title: 'Verification stays attached',
    body: 'Requirements, scenarios, design, tasks, and generated API reference stay tied to the same change instead of spreading across tools.',
  },
]

/**
 * Renders feature and workflow sections for the public homepage.
 *
 * @returns Capability overview for the landing page.
 */
export function HomeFeatures(): JSX.Element {
  return (
    <>
      <section className="feature-section" aria-labelledby="feature-heading">
        <div className="section-heading">
          <p>Why SpecD is different</p>
          <h2 id="feature-heading">Give agents the right context, not a repo to guess from.</h2>
        </div>
        <div className="feature-grid">
          {featureItems.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="feature-section" aria-labelledby="agents-heading">
        <div className="section-heading">
          <p>Across coding agents</p>
          <h2 id="agents-heading">One workflow above the agent layer.</h2>
        </div>
        <div className="feature-grid feature-grid-compact">
          <article className="feature-card">
            <h3>Agent-agnostic by design</h3>
            <p>
              Use the same workflow with any coding agent instead of rewriting the process around one vendor.
            </p>
          </article>
          <article className="feature-card">
            <h3>Plugins for other coding agents</h3>
            <p>
              Add plugins to support other coding agents without changing the underlying workflow or contract model.
            </p>
          </article>
          <article className="feature-card">
            <h3>Hooks at the right gates</h3>
            <p>
              Run checks and automation at the right workflow moments instead of bolting them on after implementation.
            </p>
          </article>
        </div>
      </section>
      <section className="how-it-works" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <p>How SpecD works</p>
          <h2 id="workflow-heading">From problem to implementation, one change at a time.</h2>
        </div>
        <div className="workflow-grid">
          <article>
            <strong>Analyze the problem</strong>
            <p>
              Start by understanding what is broken, missing, or risky before jumping into files.
            </p>
          </article>
          <article>
            <strong>Propose the solution</strong>
            <p>
              Capture the intended change clearly so the team can discuss the approach before implementation begins.
            </p>
          </article>
          <article>
            <strong>Resolve relevant specs</strong>
            <p>
              Find the specs that already constrain the work instead of rediscovering requirements from code alone.
            </p>
          </article>
          <article>
            <strong>Create or update the contract</strong>
            <p>
              Add new specs when the capability does not exist yet, or modify the existing ones when it already does.
            </p>
          </article>
          <article>
            <strong>Design before implementation</strong>
            <p>
              Define the technical changes, analyze their impact, and break the work into tasks before code starts moving.
            </p>
          </article>
          <article>
            <strong>Review the change</strong>
            <p>
              Validate the proposal, specs, and design alone or with the rest of the team before execution.
            </p>
          </article>
          <article>
            <strong>Implement with context</strong>
            <p>
              Execute against compiled context, impact analysis, and attached verification instead of improvising from prompts.
            </p>
          </article>
          <article>
            <strong>Verify the change</strong>
            <p>
              Run the verification scenarios and confirm the implementation still matches the agreed contract before closing the work.
            </p>
          </article>
        </div>
      </section>
      <section className="feature-section" aria-labelledby="teams-heading">
        <div className="section-heading">
          <p>For teams</p>
          <h2 id="teams-heading">Adopt the workflow without forcing every team into the same repo shape.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <h3>Single-repo setups</h3>
            <p>
              Keep the full change workflow close to one codebase when a team works in a single repository.
            </p>
          </article>
          <article className="feature-card">
            <h3>Monorepos with workspace boundaries</h3>
            <p>
              Split specs and code roots by workspace so context, ownership, and impact analysis stay scoped correctly.
            </p>
          </article>
          <article className="feature-card">
            <h3>Multi-repo organizations</h3>
            <p>
              Point workspaces at external repositories when shared contracts and cross-team rules need to span multiple codebases.
            </p>
          </article>
          <article className="feature-card">
            <h3>Approval and signoff gates</h3>
            <p>
              Add review checkpoints before implementation or archive so one developer or a full team can approve the change at the right moments.
            </p>
          </article>
        </div>
      </section>
    </>
  )
}
