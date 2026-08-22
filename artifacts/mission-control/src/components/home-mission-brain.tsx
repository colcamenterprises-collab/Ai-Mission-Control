import { useMemo, useState } from "react";
import { Link } from "wouter";
import "./home-mission-brain.css";

type BrainMemory = {
  id?: number | string;
  title?: string;
  name?: string;
  content?: string;
  preview?: string;
  category?: string;
  source?: string;
};

type Point = { x: number; y: number };
type Edge = { from: number; to: number };

function titleOf(item: BrainMemory) {
  return item.title || item.name || "Untitled memory";
}

function categoryOf(item: BrainMemory) {
  return item.category || item.source || "Memory";
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createBrainLayout(count: number): Point[] {
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const angle = (lane * 2.399963229728653 + seededUnit(index + 11) * 0.55) % (Math.PI * 2);
    const radial = Math.sqrt((lane + 1) / Math.max(1, Math.ceil(count / 2)));
    const rx = 226 * radial;
    const ry = 178 * radial;
    const jitterX = (seededUnit(index + 31) - 0.5) * 24;
    const jitterY = (seededUnit(index + 47) - 0.5) * 20;
    const hemisphereX = side * (72 + Math.abs(Math.cos(angle)) * rx * 0.72) + Math.cos(angle) * rx * 0.38;
    const y = Math.sin(angle) * ry * 0.78 + jitterY;
    const taper = Math.max(0.58, 1 - Math.abs(y) / 430);
    return {
      x: 500 + hemisphereX * taper + jitterX,
      y: 300 + y,
    };
  });
}

function createEdges(items: BrainMemory[], points: Point[]): Edge[] {
  const titleIndex = new Map(items.map((item, index) => [titleOf(item).trim().toLowerCase(), index]));
  const edges: Edge[] = [];
  const add = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) return;
    edges.push({ from, to });
  };

  items.forEach((item, from) => {
    for (const match of (item.content || "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
      const to = titleIndex.get(match[1].trim().toLowerCase());
      if (to !== undefined) add(from, to);
    }
  });

  points.forEach((point, from) => {
    const nearest = points
      .map((candidate, to) => ({ to, distance: to === from ? Number.POSITIVE_INFINITY : Math.hypot(candidate.x - point.x, candidate.y - point.y) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, from % 3 === 0 ? 3 : 2);
    nearest.forEach(({ to }) => add(from, to));
  });

  return edges.slice(0, Math.max(items.length * 3, 18));
}

export function HomeMissionBrain({ memories }: { memories: unknown[] }) {
  const items = memories as BrainMemory[];
  const [hovered, setHovered] = useState<number | null>(null);
  const points = useMemo(() => createBrainLayout(items.length), [items.length]);
  const edges = useMemo(() => createEdges(items, points), [items, points]);

  return (
    <section className="home-brain-shell" aria-label="Mission Brain live knowledge map">
      <header className="home-brain-header">
        <div>
          <span>Live intelligence</span>
          <h2>Mission Brain</h2>
        </div>
        <Link href="/brain" className="home-brain-open">Open Brain</Link>
      </header>

      <Link href="/brain" className="home-brain-stage" aria-label="Open full Mission Brain">
        <div className="home-brain-aurora" aria-hidden="true" />
        <svg viewBox="0 0 1000 600" role="img" aria-label={`Mission Brain network with ${items.length} memory nodes`}>
          <defs>
            <radialGradient id="brainCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,207,93,.92)" />
              <stop offset="22%" stopColor="rgba(177,101,255,.62)" />
              <stop offset="62%" stopColor="rgba(75,54,167,.14)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <filter id="brainGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="brainSoftGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <clipPath id="brainClip">
              <path d="M493 89C424 29 311 42 259 110c-66-19-135 30-143 98-55 28-75 101-45 154-26 74 23 147 95 157 31 62 112 82 169 45 45 44 119 45 165 2 46 43 120 42 165-2 57 37 138 17 169-45 72-10 121-83 95-157 30-53 10-126-45-154-8-68-77-117-143-98-52-68-165-81-234-21-4 4-8 8-11 13-3-5-7-9-11-13Z" />
            </clipPath>
          </defs>

          <g clipPath="url(#brainClip)">
            <rect x="50" y="38" width="900" height="525" fill="rgba(9,7,18,.48)" />
            <circle cx="500" cy="300" r="250" fill="url(#brainCore)" opacity=".38" />
            {edges.map((edge, index) => {
              const from = points[edge.from];
              const to = points[edge.to];
              if (!from || !to) return null;
              const active = hovered === edge.from || hovered === edge.to;
              return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={active ? "home-brain-edge is-active" : "home-brain-edge"} />;
            })}
            {points.map((point, index) => {
              const active = hovered === index;
              const size = 4.1 + (index % 6) * 0.45;
              return (
                <g key={String(items[index]?.id ?? index)} transform={`translate(${point.x} ${point.y})`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} tabIndex={0} className="home-brain-node" aria-label={`${titleOf(items[index] || {})}, ${categoryOf(items[index] || {})}`}>
                  <circle r={active ? size * 2.7 : size * 2} className="home-brain-node-halo" />
                  <circle r={active ? size * 1.34 : size} className="home-brain-node-core" filter="url(#brainSoftGlow)" />
                </g>
              );
            })}
          </g>

          <path d="M493 89C424 29 311 42 259 110c-66-19-135 30-143 98-55 28-75 101-45 154-26 74 23 147 95 157 31 62 112 82 169 45 45 44 119 45 165 2 46 43 120 42 165-2 57 37 138 17 169-45 72-10 121-83 95-157 30-53 10-126-45-154-8-68-77-117-143-98-52-68-165-81-234-21-4 4-8 8-11 13-3-5-7-9-11-13Z" className="home-brain-outline" />
          <path d="M500 105c-20 66-19 122-2 166 14 38 15 77 2 117-12 37-12 81 0 126" className="home-brain-midline" />
          <circle cx="500" cy="300" r="25" className="home-brain-core" filter="url(#brainGlow)" />
          <circle cx="500" cy="300" r="56" className="home-brain-core-ring" />
        </svg>

        {hovered !== null && items[hovered] && (
          <div className="home-brain-tooltip" role="status">
            <strong>{titleOf(items[hovered])}</strong>
            <span>{categoryOf(items[hovered])}</span>
          </div>
        )}
      </Link>

      <footer className="home-brain-footer">
        <span><i className="is-memory" />{items.length} memories</span>
        <span className="home-brain-live"><i />Live</span>
      </footer>
    </section>
  );
}
