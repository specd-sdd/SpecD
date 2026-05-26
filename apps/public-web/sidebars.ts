import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'guide/getting-started',
        'guide/_sections/getting-started/philosophy',
        'guide/_sections/getting-started/core-concepts',
        'guide/_sections/getting-started/project-structure',
        'guide/_sections/getting-started/spec-directory',
        'guide/_sections/getting-started/change-directory',
        'guide/_sections/getting-started/lifecycle',
        'guide/_sections/getting-started/spec-metadata',
        'guide/_sections/getting-started/context-compilation',
        'guide/_sections/getting-started/usage',
        'guide/_sections/getting-started/setting-up',
        'guide/_sections/getting-started/local-site',
      ],
    },
    {
      type: 'category',
      label: 'Guide',
      items: [
        'guide/workflow',
        'guide/workspaces',
        'guide/configuration',
        'guide/schemas',
        'guide/selectors',
      ],
    },
    {
      type: 'category',
      label: 'Studio',
      items: ['studio/index', 'studio/getting-started', 'studio/packages', 'studio/architecture'],
    },
    {
      type: 'category',
      label: 'Studio API',
      items: [
        'api/index',
        'api/overview',
        'api/authentication',
        'api/errors',
        'api/routes',
        'api/dtos',
        'api/openapi',
      ],
    },
    {
      type: 'category',
      label: 'Studio client',
      items: [
        'client/index',
        'client/specd-data-port',
        'client/remote-adapter',
        'client/connection-profiles',
        'client/http-transport',
        'client/errors',
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      items: ['cli/cli-reference', 'cli/serve', 'cli/ui-serve', 'cli/plugins-install'],
    },
    {
      type: 'category',
      label: 'Core',
      items: [
        'core/index',
        'core/overview',
        'core/domain-model',
        'core/ports',
        'core/services',
        'core/use-cases',
        'core/errors',
        {
          type: 'category',
          label: 'Examples',
          items: ['core/examples/implementing-a-port'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      items: [
        'config/config-reference',
        {
          type: 'category',
          label: 'Examples',
          items: [
            'config/examples/index',
            'config/examples/single-repo-minimal',
            'config/examples/single-repo-local-schema',
            'config/examples/multi-repo-coordinator',
            'config/examples/approvals-and-workflow-hooks',
            'config/examples/studio-local',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Schemas',
      items: [
        'schemas/schema-format',
        {
          type: 'category',
          label: 'Examples',
          items: [
            'schemas/examples/index',
            'schemas/examples/full-schema',
            'schemas/examples/delta-files',
            'schemas/examples/validations-and-delta-validations',
          ],
        },
      ],
    },
  ],
}

export default sidebars
