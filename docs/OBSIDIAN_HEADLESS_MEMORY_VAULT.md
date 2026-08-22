# Obsidian Headless Memory Vault

Mission Control Memory V2 can ingest Markdown notes from a server-side Obsidian vault alongside repository documentation and Agent OS process files.

## Production layout

The production default vault path is:

```text
/opt/mission-control-vault
```

The API memory sync also continues to use the repository root at:

```text
/opt/apps/ai-mission-control
```

Both paths can be overridden with environment variables:

```text
MISSION_CONTROL_REPO_ROOT=/custom/repository/path
MISSION_CONTROL_OBSIDIAN_VAULT=/custom/obsidian/vault
```

## Behaviour

When Memory V2 sync runs, Markdown files under the configured vault are imported with an `obsidian:` source prefix and the `knowledge` category. Existing source-document memory records are versioned when their Markdown content changes rather than duplicated.

The vault is optional. If the directory does not exist, Mission Control skips it and continues syncing the available repository sources.

Hidden directories, `node_modules`, and `dist` are ignored. Only `.md` files are ingested, and files larger than 512 KB are skipped.

## Current Hostinger preparation

The server-side prerequisites are expected to be:

```text
Obsidian CLI command: ob
Vault directory: /opt/mission-control-vault
Vault directory mode: 750
```

The application does not require the Obsidian desktop UI. The `ob` CLI and the filesystem vault are operational dependencies outside the repository.

## Verification after deployment

After the PR is merged and deployed, create a small Markdown note in `/opt/mission-control-vault`, then run the authenticated Memory V2 sync endpoint or open the Memory page. A successful sync should include `obsidian` in the returned source list and the note should appear in Mission Control Memory.

Production deployment remains a separate release step. Merging this PR does not restart the service or modify the live server.
