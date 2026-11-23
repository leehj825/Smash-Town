import type { Game } from './game';
import type { TimeOfDay } from './environment';

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/**
 * The game clock. A day lasts 24 real minutes (one game minute is a real second). The sky follows it (dawn and dusk are the "sunset" look),
 * shops keep their hours by it, and the crowd changes with it: a quick, bigger crowd at the morning and evening rush, strollers who stop more at
 * lunch, a thin and slow crowd at night. The clock is saved. Pressing the time-of-day buttons sets the clock to that time and it keeps running.
 * It stands still in automated tests (`navigator.webdriver`) unless `auto` is switched on, so a test that sets the time keeps it.
 */
export class Clock {
  /** Game hours, 0 to 24. */
  hour = 12;
  auto = typeof navigator !== 'undefined' ? !navigator.webdriver : true;
  /** Real seconds per game hour. */
  static readonly SECONDS_PER_HOUR = 60;
  private lastBand: TimeOfDay | null = null;

  constructor(private game: Game, hour: number | undefined) {
    if (typeof hour === 'number' && hour >= 0 && hour < 24) this.hour = hour;
  }

  static bandOf(h: number): TimeOfDay {
    if (h >= 20 || h < 5.5) return 'night';
    if (h < 8 || h >= 17.5) return 'sunset';
    return 'noon';
  }

  get band(): TimeOfDay { return Clock.bandOf(this.hour); }
  get phase(): DayPhase {
    const h = this.hour;
    if (h >= 22 || h < 5.5) return 'night';
    if (h < 10) return 'morning';
    if (h < 17) return 'day';
    return 'evening';
  }
  get rush(): boolean { const h = this.hour; return (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5); }
  get lunch(): boolean { return this.hour >= 11.5 && this.hour < 13.5; }

  /** "14:05" */
  text(): string {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** The time-of-day buttons: jump to a typical hour of that look. */
  setBand(t: TimeOfDay): void {
    this.hour = t === 'noon' ? 12 : t === 'sunset' ? 18.5 : 23;
    this.lastBand = t;
  }

  /** How crowded the street is compared with a plain daytime (1). */
  crowd(): number { return this.rush ? 1.25 : this.phase === 'night' ? 0.55 : 1; }
  /** Walking pace of strollers and how often they stop. */
  pace(): number { return this.rush ? 1.3 : this.phase === 'night' ? 0.85 : 1; }
  pauseRate(): number { return this.lunch ? 0.09 : this.rush ? 0.015 : this.phase === 'night' ? 0.02 : 0.04; }
  /** Chance multiplier for street crime events (bag snatchers, fires). */
  trouble(): number { return this.phase === 'night' ? 1.6 : this.rush ? 1.2 : 1; }

  update(dt: number): void {
    const G = this.game;
    if (this.auto && !G.inside) this.hour = (this.hour + dt / Clock.SECONDS_PER_HOUR) % 24;
    const band = this.band;
    if (this.auto && band !== this.lastBand) {
      this.lastBand = band;
      G.env.setTime(band);
    }
    G.humans.pace = this.pace();
    G.humans.pauseRate = this.pauseRate();
  }
}
