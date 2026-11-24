import { ACHIEVEMENTS, INCOME_CAP_MIN, OWNABLE, dailyById, dailyFor, emptyStats, todayKey, type DailyState, type OwnableShop, type StatKey, type Stats } from './progress';

export interface ProgressSave { stats?: Partial<Stats>; ach?: string[]; daily?: Partial<DailyState>; owned?: string[]; pending?: Partial<Record<OwnableShop, number>> }

/** Tracks stats, achievements, daily challenges and shop income. Calls back into the game for toasts and rewards. */
export class Progress {
  stats: Stats = emptyStats();
  ach: string[] = [];
  daily: DailyState;
  owned: OwnableShop[] = [];
  pending: Record<OwnableShop, number> = { donut: 0, motel: 0, arcade: 0 };

  constructor(saved: ProgressSave | undefined, private notify: (msg: string) => void, private reward: (n: number) => number, private dirty: () => void, private hold: () => boolean = () => false) {
    for (const k of Object.keys(this.stats) as StatKey[]) { const v = Number(saved?.stats?.[k]); if (Number.isFinite(v) && v > 0) this.stats[k] = v; }
    this.ach = (saved?.ach ?? []).filter((id) => ACHIEVEMENTS.some((a) => a.id === id));
    this.owned = (saved?.owned ?? []).filter((id): id is OwnableShop => id in OWNABLE);
    for (const k of Object.keys(this.pending) as OwnableShop[]) { const v = Number(saved?.pending?.[k]); if (Number.isFinite(v) && v > 0) this.pending[k] = v; }
    const d = saved?.daily;
    const day = todayKey();
    if (d && d.day === day && Array.isArray(d.ids) && d.base) {
      this.daily = { day, base: { ...emptyStats(), ...d.base }, ids: d.ids, done: Array.isArray(d.done) ? d.done : [] };
    } else this.daily = this.newDay(day);
  }

  private newDay(day: string): DailyState { return { day, base: { ...this.stats }, ids: dailyFor(day).map((q) => q.id), done: [] }; }

  add(key: StatKey, n = 1): void {
    const before = this.stats[key];
    this.stats[key] += n;
    // distance and play time change every frame: only re-check when the whole number moves
    if ((key === 'driveM' || key === 'playSec') && Math.floor(this.stats[key]) === Math.floor(before)) return;
    this.check();
  }

  private check(): void {
    if (this.hold()) return; // (the story's opening: no achievement or daily-challenge money yet)
    for (const a of ACHIEVEMENTS) {
      if (!this.ach.includes(a.id) && this.stats[a.key] >= a.target) {
        this.ach.push(a.id);
        const paid = this.reward(500);
        this.notify(`★ ${a.en} | ${a.ko} +$${paid.toLocaleString('en-US')}`);
        this.dirty();
      }
    }
    for (const id of this.daily.ids) {
      const q = dailyById(id);
      if (!q || this.daily.done.includes(id)) continue;
      if (this.stats[q.key] - this.daily.base[q.key] >= q.target) {
        this.daily.done.push(id);
        const paid = this.reward(q.reward);
        this.notify(`✓ ${q.en} | ${q.ko} +$${paid.toLocaleString('en-US')}`);
        this.dirty();
      }
    }
  }

  /** Per-frame upkeep while playing: play time, shop income, and a new set of daily challenges after midnight. */
  tick(dt: number): void {
    this.add('playSec', dt);
    for (const id of this.owned) {
      const max = OWNABLE[id].perMin * INCOME_CAP_MIN;
      this.pending[id] = Math.min(max, this.pending[id] + (OWNABLE[id].perMin / 60) * dt);
    }
    const day = todayKey();
    if (day !== this.daily.day) { this.daily = this.newDay(day); this.dirty(); }
  }

  buy(id: OwnableShop): boolean {
    if (this.owned.includes(id)) return false;
    this.owned.push(id);
    this.pending[id] = 0;
    this.dirty();
    return true;
  }

  collect(id: OwnableShop): number {
    const n = Math.floor(this.pending[id]);
    this.pending[id] -= n;
    if (n > 0) this.dirty();
    return n;
  }

  totalPending(): number { return this.owned.reduce((a, id) => a + Math.floor(this.pending[id]), 0); }

  toSave(): ProgressSave {
    return { stats: { ...this.stats }, ach: [...this.ach], daily: this.daily, owned: [...this.owned], pending: { ...this.pending } };
  }
}
