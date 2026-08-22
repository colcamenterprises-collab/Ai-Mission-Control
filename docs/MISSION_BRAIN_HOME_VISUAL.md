# Mission Brain Home Visual

The dashboard version of Mission Brain is intentionally visual-first.

## Design rules

- No persistent node labels inside the brain graph.
- Node identity is revealed on hover/focus only.
- The dashboard graph is a live visual status surface, not the full management interface.
- Clicking the visual opens `/brain`, where search, graph controls, editing, deletion and full record access remain available.
- The layout uses real Mission Control memory records and their `[[wikilink]]` relationships where available.
- When explicit links are sparse, short nearest-neighbour connections keep the brain visually coherent without inventing semantic relationships in the underlying data.
- Motion is subtle and respects `prefers-reduced-motion`.
- The component is dark-theme native and tablet responsive.

## Visual hierarchy

The brain silhouette and network are the dominant element. Header and footer text are deliberately minimal. Permanent descriptive text is kept outside the graph itself.
