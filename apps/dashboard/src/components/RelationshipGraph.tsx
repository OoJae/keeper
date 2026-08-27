'use client';

/**
 * The relationship graph (BUILD_PLAN Phase 6).
 *
 * Two encodings, and the difference between them is the whole argument:
 *   - SIZE is contribution — message count, mechanical, ours to compute.
 *   - COLOUR is warmth — the Mind's read on the relationship, asked for in its own words.
 *
 * Deriving warmth from message count would put a relationship judgment in our code, which is
 * exactly what Keeper claims not to do. It would also be wrong: Marco and Rex have identical
 * message counts, and the Mind rated Rex's two-day silence "normal pacing, not drift" while
 * flagging Marco's as an unresolved thread it owes him.
 *
 * d3-force rather than react-force-graph: BUILD_PLAN §4 allows either, and six nodes do not
 * justify pulling in three.js/WebGL for something that has to render reliably on camera.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

import { WARMTH_COLOR, type Member, type Warmth } from '@/lib/api';

interface Node {
  id: number;
  label: string;
  size: number;
  warmth: Warmth;
  x?: number;
  y?: number;
}

const WIDTH = 720;
const HEIGHT = 560;

export function RelationshipGraph({
  members,
  selectedId,
  onSelect,
}: {
  members: Member[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [, setTick] = useState(0);
  const nodesRef = useRef<Node[]>([]);

  const seed = useMemo<Node[]>(
    () =>
      members.map((m) => ({
        id: m.telegramId,
        label: m.handle ?? m.display,
        size: m.messageCount,
        warmth: m.recall?.warmth ?? 'steady',
      })),
    [members],
  );

  useEffect(() => {
    // A hub layout: the community is the centre, every member is linked to it. With six nodes
    // a free-floating force graph drifts and reads as noise; spokes read as a community.
    const nodes: Node[] = seed.map((n) => ({ ...n }));
    nodesRef.current = nodes;
    const hub = { id: 0, label: '', size: 0, warmth: 'steady' as Warmth, fx: WIDTH / 2, fy: HEIGHT / 2 };
    const all = [hub as unknown as Node, ...nodes];
    const links = nodes.map((n) => ({ source: hub, target: n }));

    const sim = forceSimulation(all as never[])
      .force('charge', forceManyBody().strength(-420))
      .force('link', forceLink(links as never[]).distance(165).strength(0.6))
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force('collide', forceCollide<Node>().radius((d) => radius(d.size) + 26))
      .on('tick', () => setTick((t) => t + 1));

    // Deterministic on camera: run it out, then stop. No perpetual animation to catch mid-jitter.
    sim.tick(240);
    sim.stop();
    setTick((t) => t + 1);
    return () => {
      sim.stop();
    };
  }, [seed]);

  const nodes = nodesRef.current;
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Relationship graph
        </h2>
        <p className="text-xs text-neutral-500">
          size = messages (counted) · colour = warmth (<span className="text-neutral-300">the Mind&rsquo;s judgment</span>)
        </p>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Community relationship graph">
        {nodes.map((n) => (
          <line
            key={`l-${n.id}`}
            x1={cx}
            y1={cy}
            x2={n.x ?? cx}
            y2={n.y ?? cy}
            stroke="#404040"
            strokeWidth={1}
          />
        ))}

        <circle cx={cx} cy={cy} r={26} fill="#171717" stroke="#525252" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-neutral-400 text-[10px]">
          group
        </text>

        {nodes.map((n) => {
          const r = radius(n.size);
          const selected = n.id === selectedId;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? cx},${n.y ?? cy})`}
              onClick={() => onSelect(n.id)}
              className="cursor-pointer"
            >
              <circle
                r={r}
                fill={WARMTH_COLOR[n.warmth]}
                fillOpacity={selected ? 0.95 : 0.65}
                stroke={selected ? '#fafafa' : '#171717'}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <text y={r + 14} textAnchor="middle" className="fill-neutral-300 text-[11px]">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
        {(Object.keys(WARMTH_COLOR) as Warmth[]).map((w) => (
          <span key={w} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: WARMTH_COLOR[w] }} />
            {w.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}

/** sqrt so one loud member cannot swamp the frame. */
function radius(messages: number): number {
  return 12 + Math.sqrt(messages) * 5;
}
