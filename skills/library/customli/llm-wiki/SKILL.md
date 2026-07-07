---
name: LLM Wiki
description: Local knowledge-management pattern for maintaining a persistent, compounding markdown wiki from immutable raw sources.
category: knowledge-management / wiki-maintenance
status: local
owner_source: Customli / user-provided pattern
recommended_agents: research, analyst, knowledge-manager, documentation, operations
local_path: skills/library/customli/llm-wiki/SKILL.md
version_date: 2026-07-07
skill_display: Local Skill
availability: Available
type: knowledge-management / wiki-maintenance
origin: user-provided local pattern
runtime_dependency: none
---

# LLM Wiki Skill

## Purpose

Use this skill to maintain a local, persistent markdown wiki that compounds knowledge over time. The wiki is the working knowledge layer agents read and maintain; immutable raw sources remain the source of truth. The pattern prevents agents from relying only on retrieval over raw documents by requiring durable wiki pages, explicit schemas, citations, contradiction tracking, and append-only operating history.

This is a local Mission Control skill. It does not require a live external source, hosted wiki service, Obsidian vault, Dataview index, Marp deck, qmd document, or any other runtime dependency.

## When to use this skill

Use this skill when agents need to:

- Build or maintain durable project, entity, concept, or source notes from a body of raw source material.
- Answer repeated questions from a stable knowledge base without re-deriving context from scratch every time.
- Preserve source citations, uncertainty, contradictions, and update history.
- Turn useful query answers into durable wiki pages for future agents.
- Keep knowledge management deterministic, auditable, and file-system local.

Do not use this skill as permission to modify canonical application data, production databases, ingestion flows, authentication, deployment behavior, or unrelated services.

## Architecture

The LLM Wiki pattern has four local layers:

1. **Raw sources**: Immutable files copied into `knowledge/raw/`. These are the source of truth and must never be edited by agents.
2. **Wiki pages**: LLM-generated and LLM-maintained markdown pages in `knowledge/wiki/`. These pages synthesize, cite, cross-link, and preserve historical context.
3. **Schema files**: Local rules in `knowledge/schema/` that define naming, frontmatter, citation, contradiction, and maintenance conventions.
4. **Workflows**: Repeatable ingest, query, and lint operations that update wiki pages, `index.md`, and `log.md`.

The wiki is intentionally a local markdown system. External URLs may be recorded only as origin/provenance metadata or citations. They must not be required for normal skill availability.

## Directory structure

Recommended local project structure:

```text
knowledge/
  raw/
    sources/
    assets/
  wiki/
    index.md
    log.md
    entities/
    concepts/
    projects/
    sources/
    synthesis/
  schema/
    AGENTS.md
    WIKI_SCHEMA.md
```

### Folder responsibilities

- `knowledge/raw/sources/`: Immutable source files such as exports, PDFs, transcripts, notes, CSVs, or copied markdown.
- `knowledge/raw/assets/`: Immutable supporting assets such as images, diagrams, attachments, or media files.
- `knowledge/wiki/index.md`: Content-oriented navigation hub organized by topic, not by chronology.
- `knowledge/wiki/log.md`: Chronological append-only record of ingest, query, and lint operations.
- `knowledge/wiki/entities/`: People, organizations, systems, locations, vendors, or named objects.
- `knowledge/wiki/concepts/`: Reusable ideas, definitions, practices, or domain concepts.
- `knowledge/wiki/projects/`: Project-specific pages, decisions, milestones, and operating notes.
- `knowledge/wiki/sources/`: Source summary pages that describe raw source files and their provenance.
- `knowledge/wiki/synthesis/`: Higher-level analysis, briefs, durable answers, and cross-source summaries.
- `knowledge/schema/AGENTS.md`: Agent-facing maintenance instructions scoped to the knowledge folder.
- `knowledge/schema/WIKI_SCHEMA.md`: Wiki schema, page templates, citation rules, and lint checklist.

## Ingest workflow

Use ingest when adding or processing raw source material.

1. Place raw material under `knowledge/raw/sources/` or `knowledge/raw/assets/` without changing its contents.
2. Create or update a source page under `knowledge/wiki/sources/` that records provenance, source path, date received if known, author if known, and reliability notes.
3. Extract only source-backed claims into entity, concept, project, or synthesis pages.
4. Preserve citations to the raw source path and, when possible, page, section, timestamp, row, or line references.
5. Use Obsidian-style markdown links such as `[[entities/example-entity]]` or `[[concepts/example-concept]]` between related pages.
6. Flag contradictions instead of overwriting older claims silently.
7. Mark uncertain, incomplete, or ambiguous claims clearly.
8. Update `knowledge/wiki/index.md` with content-oriented links to new or materially changed pages.
9. Append an entry to `knowledge/wiki/log.md` describing the ingest operation, changed wiki pages, raw sources consulted, and unresolved questions.

## Query workflow

Use query when answering a question from the wiki.

1. Search the wiki first for relevant index entries, pages, links, and prior synthesis.
2. Consult raw sources when the wiki is insufficient, stale, contradictory, or missing citations.
3. Answer with citations to wiki pages and raw sources where available.
4. Clearly distinguish source-backed facts, wiki synthesis, inference, uncertainty, and missing information.
5. Do not invent source-backed facts. If the source does not support a claim, say so.
6. If the answer is durable and likely to be useful again, file it back into the wiki as a new or updated page under the appropriate folder.
7. Update `knowledge/wiki/index.md` for any new or materially changed wiki page.
8. Append a query entry to `knowledge/wiki/log.md` with the question, pages consulted, raw sources consulted, answer location if filed, and unresolved follow-ups.

## Lint workflow

Use lint to improve consistency, navigability, and auditability without changing raw sources.

1. Validate that every wiki page follows `knowledge/schema/WIKI_SCHEMA.md`.
2. Check that important pages are reachable from `knowledge/wiki/index.md`.
3. Check that wiki pages use markdown links for related entities, concepts, projects, sources, and synthesis pages.
4. Check that source-backed claims include citations.
5. Check that uncertain claims are marked clearly.
6. Check that contradictions are preserved and labeled rather than overwritten.
7. Check that `knowledge/wiki/log.md` is chronological and append-only.
8. Fix wiki pages only when the fix is source-backed or schema-backed.
9. Append a lint entry to `knowledge/wiki/log.md` describing checks performed, fixes made, and remaining issues.

## Indexing and logging

`index.md` is content-oriented. It should help agents navigate the wiki by topic, entity, project, source, and synthesis area. It should not be a chronological changelog.

`log.md` is chronological and append-only. It records operational history, including:

- Ingest operations.
- Query operations that materially consult or change the wiki.
- Lint operations.
- Pages created or changed.
- Raw sources consulted.
- Contradictions found.
- Unresolved questions.

Do not rewrite older log entries except to correct formatting in a clearly marked maintenance operation. Prefer appending a correction entry.

## Source-of-truth rules

- Raw sources are immutable sources of truth.
- Wiki pages are maintained synthesis, not canonical raw data.
- External URLs are provenance metadata or citations only; they are not runtime dependencies.
- If a wiki page conflicts with a raw source, the raw source wins unless the source is explicitly superseded by a newer raw source.
- If two raw sources conflict, preserve both claims and add a contradiction note with citations.
- Never silently collapse conflicting claims into a single answer.
- Never fill missing facts with guesses. Use `UNKNOWN`, `UNMAPPED`, `NULL`, or `INSUFFICIENT DATA` as appropriate to the wiki schema.

## Agent behavior rules

- Never modify raw sources.
- Always update `knowledge/wiki/index.md` after wiki changes.
- Always append to `knowledge/wiki/log.md` after ingest, query, or lint operations.
- Use markdown links between pages.
- Flag contradictions instead of silently overwriting old claims.
- Preserve source citations.
- Mark uncertain claims clearly.
- Do not invent source-backed facts.
- File valuable query answers back into the wiki when appropriate.
- Keep changes additive and auditable.
- Prefer deterministic file updates over opaque tool state.
- Keep optional tooling optional; the wiki must remain usable as plain markdown files.

## Suggested folder layout

Use this starter layout for new knowledge bases:

```text
knowledge/
  raw/
    sources/
      README.md
    assets/
      README.md
  wiki/
    index.md
    log.md
    entities/
      README.md
    concepts/
      README.md
    projects/
      README.md
    sources/
      README.md
    synthesis/
      README.md
  schema/
    AGENTS.md
    WIKI_SCHEMA.md
```

Suggested wiki page frontmatter:

```yaml
---
title: Example Page
kind: entity | concept | project | source | synthesis
status: draft | active | superseded
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources:
  - knowledge/raw/sources/example.md
confidence: source-backed | partial | uncertain
---
```

Suggested contradiction block:

```markdown
> [!warning] Contradiction
> Claim A: ... Citation: `knowledge/raw/sources/source-a.md`
> Claim B: ... Citation: `knowledge/raw/sources/source-b.md`
> Current handling: unresolved / superseded / needs owner review.
```

Optional tooling may include markdown previewers, Obsidian-style graph viewers, qmd, Marp, or Dataview-like indexes, but the wiki must not depend on any of them.

## Example commands/prompts

Example local setup commands:

```bash
mkdir -p knowledge/raw/sources knowledge/raw/assets
mkdir -p knowledge/wiki/entities knowledge/wiki/concepts knowledge/wiki/projects knowledge/wiki/sources knowledge/wiki/synthesis
mkdir -p knowledge/schema
touch knowledge/wiki/index.md knowledge/wiki/log.md knowledge/schema/AGENTS.md knowledge/schema/WIKI_SCHEMA.md
```

Example ingest prompt:

```text
Use the LLM Wiki skill. Ingest knowledge/raw/sources/vendor-notes.md into the local wiki. Do not modify raw sources. Create or update source, entity, concept, and synthesis pages as needed. Preserve citations, flag contradictions, update knowledge/wiki/index.md, and append to knowledge/wiki/log.md.
```

Example query prompt:

```text
Use the LLM Wiki skill. Answer this question from knowledge/wiki first, then consult raw sources only if needed: "What are the current unresolved onboarding risks?" Cite sources, mark uncertainty, and file the durable answer back into knowledge/wiki/synthesis/ if it will be useful again. Update index.md and append to log.md if you change the wiki.
```

Example lint prompt:

```text
Use the LLM Wiki skill. Lint knowledge/wiki against knowledge/schema/WIKI_SCHEMA.md. Do not modify raw sources. Fix missing links, missing index entries, citation gaps, and schema drift only when source-backed or schema-backed. Append the lint result to knowledge/wiki/log.md.
```

## Acceptance checklist

- [ ] The LLM Wiki exists as a local `SKILL.md` file in the Mission Control filesystem.
- [ ] Agents can consume the skill directly from the local filesystem.
- [ ] The skill is marked as local and available in metadata.
- [ ] The skill type is `knowledge-management / wiki-maintenance`.
- [ ] The origin is recorded as a user-provided local pattern.
- [ ] Runtime dependency is `none`.
- [ ] No live external reference is required for normal skill use.
- [ ] Raw sources are never modified by wiki workflows.
- [ ] `index.md` is updated after wiki changes.
- [ ] `log.md` is appended after ingest, query, and lint operations.
- [ ] Markdown links connect related wiki pages.
- [ ] Citations, contradictions, source references, uncertainty, and update history are preserved.
