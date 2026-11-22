// Owner: simulation
//
// Walking routes for the responders on the 3D campus. The roads and footpaths
// already in campus.json are turned into a graph, and a route is the shortest
// way through it. Plain functions, no React or three.js.
//
// All points are [x, z] in scene metres, the same as the road lines.

export type Pt = [number, number];
type Road = { kind: string; line: number[] };

// Nobody walks along these.
const NOT_WALKABLE = new Set(["motorway", "motorway_link"]);

type Graph = {
  pts: Pt[];
  // edges[i] = [neighbour, metres, neighbour, metres, ...]
  edges: number[][];
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// One node per road vertex. Roads that meet share a vertex in the map data,
// which is what joins them. Only the largest connected piece is kept, so a
// route can never start on a stub that leads nowhere.
function buildGraph(roads: Road[]): Graph {
  const ids = new Map<string, number>();
  const pts: Pt[] = [];
  const edges: number[][] = [];
  const idOf = (x: number, z: number) => {
    const key = `${x},${z}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = pts.length;
      ids.set(key, id);
      pts.push([x, z]);
      edges.push([]);
    }
    return id;
  };

  for (const road of roads) {
    if (NOT_WALKABLE.has(road.kind)) continue;
    const l = road.line;
    for (let i = 0; i + 3 < l.length; i += 2) {
      const a = idOf(l[i], l[i + 1]);
      const b = idOf(l[i + 2], l[i + 3]);
      if (a === b) continue;
      const m = dist(pts[a], pts[b]);
      edges[a].push(b, m);
      edges[b].push(a, m);
    }
  }

  // Label each connected piece, then keep the biggest.
  const piece = new Int32Array(pts.length).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let start = 0; start < pts.length; start++) {
    if (piece[start] !== -1) continue;
    let size = 0;
    const stack = [start];
    piece[start] = start;
    while (stack.length) {
      const n = stack.pop()!;
      size++;
      for (let e = 0; e < edges[n].length; e += 2) {
        const to = edges[n][e];
        if (piece[to] === -1) {
          piece[to] = start;
          stack.push(to);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = start;
    }
  }

  const keep = new Map<number, number>();
  const outPts: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (piece[i] === best) {
      keep.set(i, outPts.length);
      outPts.push(pts[i]);
    }
  }
  const outEdges: number[][] = outPts.map(() => []);
  for (const [old, id] of keep) {
    for (let e = 0; e < edges[old].length; e += 2) {
      outEdges[id].push(keep.get(edges[old][e])!, edges[old][e + 1]);
    }
  }
  return { pts: outPts, edges: outEdges };
}

// The campus roads are one array for the life of the page, so build once.
const graphs = new WeakMap<Road[], Graph>();
function graphFor(roads: Road[]): Graph {
  let g = graphs.get(roads);
  if (!g) {
    g = buildGraph(roads);
    graphs.set(roads, g);
  }
  return g;
}

// How far from each end to look for a path to join or leave. The nearest
// path is often not the best one: it can be on the far side of a building.
const REACH_METRES = 60;
// Cutting across open ground counts as this much longer than it is, so a
// route prefers paths but still goes straight when the paths go the long way.
const OFF_PATH_COST = 1.5;

// Every node within reach of a point with its distance, or the single
// nearest node when none is that close.
function nodesNear(g: Graph, p: Pt): [number, number][] {
  const near: [number, number][] = [];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.pts.length; i++) {
    const d = dist(g.pts[i], p);
    if (d <= REACH_METRES) near.push([i, d]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return near.length ? near : [[best, bestD]];
}

/**
 * The walk from one point to another: onto a nearby path, along the shortest
 * route, then off the path to the destination. Falls back to a straight line
 * when there are no roads to follow, or when the two ends are close and going
 * straight is clearly shorter than any way round by path.
 */
export function walkRoute(roads: Road[] | undefined, from: Pt, to: Pt): Pt[] {
  if (!roads || roads.length === 0) return [from, to];
  const g = graphFor(roads);
  if (g.pts.length === 0) return [from, to];

  // Dijkstra from every joining point at once, each starting with the cost of
  // walking to it. `heap` is a binary heap of [cost, node] pairs.
  const best = new Float64Array(g.pts.length).fill(Infinity);
  const prev = new Int32Array(g.pts.length).fill(-1);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  for (const [n, d] of nodesNear(g, from)) {
    best[n] = d * OFF_PATH_COST;
    push([best[n], n]);
  }
  while (heap.length) {
    const [d, n] = pop();
    if (d > best[n]) continue;
    for (let e = 0; e < g.edges[n].length; e += 2) {
      const next = g.edges[n][e];
      const nd = d + g.edges[n][e + 1];
      if (nd < best[next]) {
        best[next] = nd;
        prev[next] = n;
        push([nd, next]);
      }
    }
  }

  // Leave the path wherever makes the whole walk shortest. Going straight
  // there is only an option when the two ends are close: further apart, a
  // straight line would cut through buildings.
  let leave = -1;
  const straight = dist(from, to);
  let total = straight <= 2 * REACH_METRES ? straight * OFF_PATH_COST : Infinity;
  for (const [n, d] of nodesNear(g, to)) {
    const cost = best[n] + d * OFF_PATH_COST;
    if (cost < total) {
      total = cost;
      leave = n;
    }
  }
  if (leave === -1) return [from, to];

  const nodes: Pt[] = [];
  for (let n = leave; n !== -1; n = prev[n]) nodes.push(g.pts[n]);
  return [from, ...nodes.reverse(), to];
}

/** Total length of a route in metres. */
export function routeLength(route: Pt[]): number {
  let m = 0;
  for (let i = 1; i < route.length; i++) m += dist(route[i - 1], route[i]);
  return m;
}

/** The point a fraction (0..1) of the way along a route. */
export function pointAlong(route: Pt[], fraction: number): Pt {
  const want = routeLength(route) * Math.min(1, Math.max(0, fraction));
  let walked = 0;
  for (let i = 1; i < route.length; i++) {
    const step = dist(route[i - 1], route[i]);
    if (walked + step >= want && step > 0) {
      const t = (want - walked) / step;
      return [
        route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t,
        route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t,
      ];
    }
    walked += step;
  }
  return route[route.length - 1];
}
