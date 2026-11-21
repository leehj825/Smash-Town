import { net } from './world';

/** A route along the roads: a polyline of world points and its total length in metres. */
export interface Route { pts: { x: number; z: number }[]; len: number }

interface Snap { ax: number; az: number; a: number; b: number; px: number; pz: number; ca: number; cb: number; edge: string }

/** Road-network pathfinding for the story guide (Dijkstra over the junction graph). */
export class Navigator {
  private node(i: number, j: number): number { return i * net.nz + j; }

  /** Nearest road edge to a point: the projected point and the two junctions it connects. */
  private snap(x: number, z: number): Snap | null {
    let best: Snap | null = null;
    let bd = Infinity;
    const consider = (x0: number, z0: number, x1: number, z1: number, a: number, b: number, edge: string) => {
      const ex = x1 - x0, ez = z1 - z0;
      const L2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / L2));
      const px = x0 + ex * t, pz = z0 + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        const len = Math.sqrt(L2);
        best = { ax: x0, az: z0, a, b, px, pz, ca: t * len, cb: (1 - t) * len, edge };
      }
    };
    for (let j = 0; j < net.nz; j++) for (let i = 0; i < net.nx - 1; i++) {
      if (net.segH[j]?.[i]) consider(net.xs[i], net.zs[j], net.xs[i + 1], net.zs[j], this.node(i, j), this.node(i + 1, j), `h${j}_${i}`);
    }
    for (let i = 0; i < net.nx; i++) for (let j = 0; j < net.nz - 1; j++) {
      if (net.segV[i]?.[j]) consider(net.xs[i], net.zs[j], net.xs[i], net.zs[j + 1], this.node(i, j), this.node(i, j + 1), `v${i}_${j}`);
    }
    return best;
  }

  private nodePos(n: number): { x: number; z: number } {
    return { x: net.xs[Math.floor(n / net.nz)], z: net.zs[n % net.nz] };
  }

  /** Shortest road route from one point to another; falls back to a straight line when no road is near. */
  route(x0: number, z0: number, x1: number, z1: number): Route {
    const straight: Route = { pts: [{ x: x0, z: z0 }, { x: x1, z: z1 }], len: Math.hypot(x1 - x0, z1 - z0) };
    if (!net.nx) return straight;
    const s = this.snap(x0, z0), e = this.snap(x1, z1);
    if (!s || !e) return straight;
    const lead = Math.hypot(x0 - s.px, z0 - s.pz);
    const tail = Math.hypot(x1 - e.px, z1 - e.pz);
    if (s.edge === e.edge) {
      const len = lead + Math.hypot(s.px - e.px, s.pz - e.pz) + tail;
      return { pts: [{ x: x0, z: z0 }, { x: s.px, z: s.pz }, { x: e.px, z: e.pz }, { x: x1, z: z1 }], len };
    }
    const N = net.nx * net.nz;
    const dist = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[s.a] = s.ca; dist[s.b] = Math.min(dist[s.b], s.cb);
    for (;;) {
      let u = -1, ud = Infinity;
      for (let k = 0; k < N; k++) if (!done[k] && dist[k] < ud) { ud = dist[k]; u = k; }
      if (u < 0) break;
      done[u] = 1;
      const i = Math.floor(u / net.nz), j = u % net.nz;
      const relax = (v: number, w: number) => { if (ud + w < dist[v]) { dist[v] = ud + w; prev[v] = u; } };
      if (i + 1 < net.nx && net.segH[j]?.[i]) relax(this.node(i + 1, j), net.xs[i + 1] - net.xs[i]);
      if (i > 0 && net.segH[j]?.[i - 1]) relax(this.node(i - 1, j), net.xs[i] - net.xs[i - 1]);
      if (j + 1 < net.nz && net.segV[i]?.[j]) relax(this.node(i, j + 1), net.zs[j + 1] - net.zs[j]);
      if (j > 0 && net.segV[i]?.[j - 1]) relax(this.node(i, j - 1), net.zs[j] - net.zs[j - 1]);
    }
    const viaA = dist[e.a] + e.ca, viaB = dist[e.b] + e.cb;
    const end = viaA <= viaB ? e.a : e.b;
    if (!Number.isFinite(Math.min(viaA, viaB))) return straight;
    const nodes: number[] = [];
    for (let n = end; n >= 0; n = prev[n]) { nodes.push(n); if (prev[n] < 0) break; }
    nodes.reverse();
    const pts = [{ x: x0, z: z0 }, { x: s.px, z: s.pz }, ...nodes.map((n) => this.nodePos(n)), { x: e.px, z: e.pz }, { x: x1, z: z1 }];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    return { pts, len };
  }
}
