## What is inside a change directory

Each change is a directory inside `.specd/changes/` containing the artifacts produced so far:

```
.specd/changes/
└── 20260402-173732-add-oauth-login/
    ├── manifest.json          # Change state, scope, and artifact tracking
    ├── proposal.md            # Initial idea and scope
    ├── specs/
    │   └── default/
    │       └── auth/
    │           └── oauth/
    │               ├── spec.md    # New spec content staged in the change
    │               └── verify.md
    ├── design.md              # Technical approach
    ├── tasks.md               # Implementation task list
    └── deltas/
        └── default/
            └── auth/
                └── oauth/
                    └── spec.md.delta.yaml # Structured delta operations for an existing spec artifact
```

The timestamped directory name is assigned by SpecD when the change is created. `specs/` contains staged full artifacts for new specs introduced by the change. `deltas/` contains structured YAML documents that express modifications to existing spec artifacts — not as text diffs, but as explicit operations (additions, modifications, removals). specd applies these deterministically when archiving the change.
