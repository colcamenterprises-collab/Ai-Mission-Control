---
name: Graphify
description: Local knowledge graph skill for turning repositories, docs, papers, diagrams, and wiki folders into queryable graph artifacts for Mission Control.
category: knowledge-graph / code-intelligence
status: local
owner: Customli / user-provided pattern
local_path: skills/library/customli/graphify/SKILL.md
runtime_dependency: none
version: 2026-07-07
---

# Graphify

Graphify is a local Mission Control skill for producing knowledge graph artifacts from repositories, documentation, wiki pages, papers, and diagrams.

It must not be treated as a live external dependency.

## Purpose

Use Graphify to help agents and humans understand central system nodes, important code and document relationships, unexpected links, repository architecture, wiki structure, and visual learning maps for the dashboard.

## Local artifact model

Graphify outputs should be local files:

- graph.html
- graph.json
- GRAPH_REPORT.md
- metadata.json

Mission Control should publish approved graph artifacts to:

artifacts/mission-control/public/knowledge-graph/mission-control/

## Dashboard rule

The dashboard should show the latest local graph artifact.

The dashboard must not fetch a graph from an external website at runtime.

## Agent rules

Agents must only scan approved local folders, preserve graph reports and metadata, treat surprise edges as investigation prompts, flag high-degree nodes as possible risk or dependency hubs, and keep graph artifacts local.

## Security rules

Validate input paths, stay inside approved project directories, avoid arbitrary URL ingestion, escape labels in HTML outputs, and preserve provenance in metadata.

## Future install note

Graphify may later be installed locally with:

python3 -m pip install graphifyy
graphify install

The dashboard should still work without Graphify installed by displaying the latest local artifacts.
