#!/usr/bin/env node
/**
 * Fixes script-generated deltas for align-studio-specs-post-merge.
 * Run: node dev/scripts/fix-align-studio-specs-deltas.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const CHANGE = path.join(
  ROOT,
  'specd-sdd/changes/20260630-171934-align-studio-specs-post-merge',
)

function indentBlock(text, spaces = 4) {
  return text
    .split('\n')
    .map((l) => (l.length ? ' '.repeat(spaces) + l : l))
    .join('\n')
}

function writeDelta(ws, cap, specYaml, verifyYaml) {
  const dir = path.join(CHANGE, 'deltas', ws, cap)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md.delta.yaml'), specYaml)
  if (verifyYaml !== undefined) {
    fs.writeFileSync(path.join(dir, 'verify.md.delta.yaml'), verifyYaml)
  }
}

function extractSection(md, heading) {
  const re = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`)
  const m = md.match(re)
  return m ? m[1].trimEnd() : null
}

function handlerPurpose(label) {
  return `## Purpose

HTTP handlers for **${label}** in SpecD Studio. They validate requests, call kernel use cases exposed through \`@specd/sdk\` as listed in the paired \`routes-*\` spec, and map results through presenters. Business rules live in core use cases invoked via \`apiContext.kernel\` — not in this delivery module.`
}

function handlerDelegation(intro, bullets) {
  const body = bullets.map((b) => `- ${b}`).join('\n')
  return `### Requirement: handler delegates to kernel without duplicating domain rules

${intro}

${body}`
}

function handlerConstraints(extraFirstLine, lines) {
  const first =
    extraFirstLine ??
    'Handler modules MUST import kernel types and use-case entry points from `@specd/sdk`, not `@specd/core` directly.'
  return `## Constraints

- ${first}
${lines.map((l) => `- ${l}`).join('\n')}`
}

const CONSTRAINT_TAIL = [
  'HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.',
  'v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.',
  'There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.',
  'Canonical workspace spec artifacts are read-only in Studio v1.',
]

function buildHandlerDelta({
  label,
  routesId,
  routesCap,
  delegationIntro,
  delegationBullets,
  constraintsFirst,
  constraintTail = [
    ...CONSTRAINT_TAIL.slice(0, 2),
    'Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.',
    ...CONSTRAINT_TAIL.slice(2),
  ],
  extraDeps = [],
  sdkAfter = 'Requirement: failures map to RFC 7807 problem+json',
  moduleFile,
}) {
  const deps = [
    '- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout',
    '- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions',
    `- [\`sdk:composition\`](../../sdk/composition/spec.md) — SDK import policy for API delivery`,
    `- [\`api:${routesCap}\`](../${routesCap}/spec.md) — HTTP contract`,
    ...extraDeps,
  ]

  const specOps = [
    `- op: modified
  selector:
    type: section
    matches: Purpose
  content: |
${indentBlock(handlerPurpose(label))}
`,
    `- op: modified
  selector:
    type: section
    matches: 'Requirement: handler delegates to kernel without duplicating domain rules'
  content: |
${indentBlock(handlerDelegation(delegationIntro, delegationBullets))}
`,
    `- op: modified
  selector:
    type: section
    matches: Constraints
  content: |
${indentBlock(handlerConstraints(constraintsFirst, constraintTail))}
`,
    `- op: added
  position:
    parent:
      type: section
      matches: Requirements
    after:
      type: section
      matches: '${sdkAfter}'
  content: |
    ### Requirement: SDK delivery imports

    Handler modules MUST import kernel types, errors, and use-case entry points from \`@specd/sdk\`. They MUST NOT import \`@specd/core\` directly.
`,
    `- op: modified
  selector:
    type: section
    matches: 'Spec Dependencies'
  content: |
${indentBlock(`## Spec Dependencies\n\n${deps.join('\n')}`)}
`,
  ]

  const verify = `- op: added
  position:
    parent:
      type: section
      matches: Requirements
    after:
      type: section
      matches: 'Requirement: SDK delivery imports'
  content: |
    ### Requirement: SDK delivery imports

    #### Scenario: Handler imports kernel surface from SDK

    - **WHEN** inspecting \`${moduleFile}\` module imports
    - **THEN** kernel types and errors are imported from \`@specd/sdk\`
    - **AND** \`@specd/core\` is not imported directly
`

  return { spec: `${specOps.join('\n')}\n`, verify }
}

const HANDLERS = [
  {
    cap: 'handler-project',
    label: 'project',
    routesCap: 'routes-project',
    moduleFile: 'handler-project',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel` (types imported from `@specd/sdk`), including:',
    delegationBullets: [
      '`GetProjectContext`',
      'project status aggregation (`ListChanges`, `ListDrafts`, `ListDiscarded`, list archived, graph stats via `apiContext.createGraphProvider()`)',
      '`kernel.specs.getActiveSchema`',
      '`kernel.specs.validateSchema`',
    ],
  },
  {
    cap: 'handler-changes-mutate',
    label: 'changes mutate',
    routesCap: 'routes-changes-mutate',
    moduleFile: 'handler-changes-mutate',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: [
      '`SaveChangeArtifact`',
      '`ValidateArtifacts`',
      '`TransitionChange`',
      '`EditChange`',
      'draft / restore / discard / archive',
      '`approveSpec` / `approveSignoff`',
      '`InvalidateChange`',
      '`SkipArtifact`',
      '`updateSpecDeps`',
      '`updateImplementationTracking`',
    ],
    extraDeps: [
      '- [`core:save-change-artifact`](../../core/save-change-artifact/spec.md) — PUT artifact save',
    ],
  },
  {
    cap: 'handler-changes-collection',
    label: 'changes collection',
    routesCap: 'routes-changes-collection',
    moduleFile: 'handler-changes-collection',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: [
      '`CreateChange`',
      '`kernel.changes.list`',
      '`kernel.changes.listDrafts`',
      '`kernel.changes.listDiscarded`',
      '`kernel.changes.listArchived`',
      '`DetectOverlap`',
    ],
    sdkAfter: 'Requirement: archived list serializes list-result structure instead of legacy arrays',
  },
  {
    cap: 'handler-archived-changes',
    label: 'archived changes',
    routesCap: 'routes-archived-changes',
    moduleFile: 'handler-archived-changes',
    delegationIntro:
      'Business rules MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: [
      '`GetArchivedChange`',
      '`GetReadOnlyChangeArtifact` for archived artifact body reads',
    ],
    constraintTail: [
      ...CONSTRAINT_TAIL.slice(0, 2),
      'Artifact save/load MUST use `core:save-change-artifact`, `core:get-change-artifact`, and `core:get-read-only-change-artifact` as appropriate — not raw repository access from HTTP handlers.',
      ...CONSTRAINT_TAIL.slice(2),
    ],
    sdkAfter: 'Requirement: archived detail preserves read-only change fields',
  },
  {
    cap: 'handler-specs-read',
    label: 'specs read',
    routesCap: 'routes-specs-read',
    moduleFile: 'handler-specs-read',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: [
      '`ListSpecs`',
      'spec repository get (metadata)',
      '`GetOutline`',
      '`GetContext`',
      '`kernel.specs.search`',
      'canonical artifact read (no write in v1)',
    ],
  },
  {
    cap: 'handler-specs-mutate',
    label: 'specs mutate',
    routesCap: 'routes-specs-mutate',
    moduleFile: 'handler-specs-mutate',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: ['`ValidateSpecs`', '`saveMetadata`', '`generateMetadata`'],
  },
  {
    cap: 'handler-workspaces',
    label: 'workspaces',
    routesCap: 'routes-workspaces',
    moduleFile: 'handler-workspaces',
    delegationIntro:
      'Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:',
    delegationBullets: [
      '`ListWorkspaces`',
      '`ListSpecs`',
      '`kernel.specs.get`',
      '`kernel.specs.getOutline`',
      '`kernel.specs.getContext`',
      '`kernel.specs.search`',
    ],
    sdkAfter: 'Requirement: workspace discovery preserves orchestrated ordering',
  },
]

for (const h of HANDLERS) {
  const { spec, verify } = buildHandlerDelta(h)
  writeDelta('api', h.cap, spec, verify)
  console.log('fixed handler', h.cap)
}

// --- client: prepend bootstrap line, preserve original constraints ---
const CLIENT_BOOTSTRAP =
  '`@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.'

for (const cap of fs.readdirSync(path.join(ROOT, 'specs/client'))) {
  const specPath = path.join(ROOT, 'specs/client', cap, 'spec.md')
  if (!fs.existsSync(specPath)) continue
  const md = fs.readFileSync(specPath, 'utf8')
  const constraints = extractSection(md, 'Constraints')
  if (!constraints) {
    writeDelta('client', cap, '- op: no-op\n', '- op: no-op\n')
    continue
  }
  const lines = constraints.split('\n').filter((l) => l.startsWith('- '))
  const withoutBootstrap = lines.filter(
    (l) => !l.includes('MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap'),
  )
  const newConstraints = [`- ${CLIENT_BOOTSTRAP}`, ...withoutBootstrap].join('\n')
  const specYaml = `- op: modified
  selector:
    type: section
    matches: Constraints
  content: |
    ## Constraints

${indentBlock(newConstraints, 4)}
`
  writeDelta('client', cap, specYaml, '- op: no-op\n')
  console.log('fixed client', cap)
}

// --- presenters: rule only, restore original constraints ---
const PRESENTER_RULE = `### Requirement: presenter does not encode business rules

The presenter MUST NOT decide lifecycle transitions, validation outcomes, or approval state — those belong in core use cases invoked via the SDK kernel surface.`

for (const cap of fs
  .readdirSync(path.join(ROOT, 'specs/api'))
  .filter((c) => c.startsWith('presenter-'))) {
  const specPath = path.join(ROOT, 'specs/api', cap, 'spec.md')
  const md = fs.readFileSync(specPath, 'utf8')
  const ops = []
  if (md.includes('Requirement: presenter does not encode business rules')) {
    ops.push(`- op: modified
  selector:
    type: section
    matches: 'Requirement: presenter does not encode business rules'
  content: |
${indentBlock(PRESENTER_RULE)}
`)
  }
  const constraints = extractSection(md, 'Constraints')
  if (constraints) {
    ops.push(`- op: modified
  selector:
    type: section
    matches: Constraints
  content: |
    ## Constraints

${indentBlock(constraints)}
`)
  }
  writeDelta('api', cap, `${ops.join('\n')}\n`, '- op: no-op\n')
  console.log('fixed presenter', cap)
}

// --- routes-graph ---
const API_CONSTRAINTS_SDK = `## Constraints

- \`@specd/api\` delivery and composition code MUST import host bootstrap and kernel types from \`@specd/sdk\`, not \`@specd/core\` or \`@specd/code-graph\` directly.
- HTTP handlers MUST NOT import \`@specd/core\` from \`@specd/ui\` or \`@specd/client\`.
- v1 server auth: \`api.auth.type\` from \`specd.yaml\` (never \`studio.*\`); registry registers only \`disabled\`; no server-side Bearer enforcement on loopback or \`specd ui serve\`.
- Artifact save/load MUST use \`core:save-change-artifact\` and \`core:get-change-artifact\` — not raw \`ChangeRepository.saveArtifact\` from HTTP handlers.
- There is no \`GET /changes/{name}/validation\` resource; use \`GET .../status\` and \`POST .../validate\`.
- Canonical workspace spec artifacts are read-only in Studio v1.`

writeDelta(
  'api',
  'routes-graph',
  `- op: modified
  selector:
    type: section
    matches: Purpose
  content: |
    ## Purpose

    Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Graph** under \`/v1\`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. HTTP contract for code-graph operations via the SDK host graph factory (\`apiContext.createGraphProvider\`, \`runIndexProjectGraph\`) — not CLI/MCP.

- op: modified
  selector:
    type: section
    matches: 'Requirement: POST graph index rebuilds the code graph index'
  content: |
    ### Requirement: POST graph index rebuilds the code graph index

    \`POST /v1/graph/index\` MUST trigger reindex via \`runIndexProjectGraph\` from \`@specd/sdk\` (using the process-scoped SDK host context). v1 MAY block until completion; async job ids are deferred.

    Indexing MUST rebuild the full project graph, not a workspace-scoped subset, so cross-workspace spec-to-symbol and symbol-to-symbol links remain globally consistent.

    When the request body includes \`force: true\`, the handler MUST recreate persistent graph storage before indexing so the run starts from an empty graph. The response MUST return the graph provider's indexing summary DTO, including per-workspace breakdown.

    \`POST /v1/graph/index\` MUST accept only the documented body shape \`{ force?: boolean }\`. Unknown properties such as \`workspaces\` MUST be rejected with HTTP 400 \`application/problem+json\` and code \`INVALID_REQUEST\`.

- op: modified
  selector:
    type: section
    matches: 'Requirement: graph index preparation mirrors the CLI assembly flow'
  content: |
    ### Requirement: graph index preparation mirrors the CLI assembly flow

    Before invoking the provider index operation, the API MUST assemble index input through \`runIndexProjectGraph\` from \`@specd/sdk\`, which mirrors the CLI assembly flow:

    - obtain orchestrated workspaces from \`kernel.project.listWorkspaces.execute()\`
    - derive effective graph config from project \`SpecdConfig\`
    - pass that assembled project-level input into the code-graph provider

    The API MUST NOT maintain a separate legacy workspace-target bootstrap path that can drift from CLI behavior.

- op: modified
  selector:
    type: section
    matches: Constraints
  content: |
${indentBlock(API_CONSTRAINTS_SDK)}
`,
  '- op: no-op\n',
)
console.log('fixed routes-graph')

console.log('Done.')
