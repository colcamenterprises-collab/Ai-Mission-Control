# Mission Control Lead Permissions

Permissions belong to the role or to explicit runtime grants, not to an agent's personality profile.

## Principles

- Least privilege by default.
- Owner approval remains authoritative for approval-gated actions.
- Repository, production, financial, credential and destructive operations must continue to use existing Mission Control policy controls.
- A replacement agent receives only the permissions attached to the assigned role and explicit grants.
- Agent profile files must not contain secrets, API keys or bearer tokens.
