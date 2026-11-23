import type { Human } from './humans';
import type { GameVehicle } from './vehicles';

/**
 * The event bus. Things that happen in the city are announced here as events; every system that cares (the crowd, witnesses, the news,
 * the ambulance, the police) listens for the ones it needs. Nobody calls those systems directly any more, so a new system (a gang, a
 * reputation, a new job) only has to listen: it never has to be wired into the code that causes the event.
 */
export type GameEvent =
  /** Somebody in the street was killed (or, in Kids Play, knocked out as if killed). `byPlayer` is false for a car that was not yours. */
  | { type: 'civKilled'; x: number; z: number; human: Human; byPlayer: boolean; kids: boolean }
  /** The player punched, kicked or hit a civilian. */
  | { type: 'civAssaulted'; x: number; z: number }
  /** The player's car ran a civilian over. */
  | { type: 'civRunOver'; x: number; z: number; killed: boolean }
  /** A gun went off. */
  | { type: 'gunshot'; x: number; z: number; /** Not the player's: other people's shooting (crossfire). */ ambient?: boolean }
  /** The wanted level went up to `stars`. */
  | { type: 'wantedRaised'; stars: number }
  /** The police lost you. */
  | { type: 'wantedLost' }
  /** A cop was knocked out; `total` is the running count. */
  | { type: 'copDown'; total: number }
  /** Something blew up (a wrecked car, a rocket, a grenade). `byPlayer` when the blast is the player's doing. */
  | { type: 'explosion'; x: number; z: number; byPlayer: boolean }
  /** A gang member was knocked out. */
  | { type: 'gangDown'; x: number; z: number }
  /** The player took over a gang's turf. */
  | { type: 'turfCaptured'; zone: number }
  /** A gang took its turf back. */
  | { type: 'turfLost'; zone: number }
  /** The player did something good for the neighbourhood (a patient treated, a delivery, a fare). */
  | { type: 'helped'; x: number; z: number; amount: number }
  /** Something caught fire in the street. */
  | { type: 'fire'; x: number; z: number }
  /** The police and a gang started shooting at each other. */
  | { type: 'crossfire'; x: number; z: number }
  /** Unrest broke out. */
  | { type: 'riot'; x: number; z: number }
  /** A thief grabbed somebody's bag and is running. */
  | { type: 'theft'; x: number; z: number }
  | { type: 'hunterSpawned' }
  | { type: 'heist' }
  | { type: 'blackout' }
  /** A parked car's alarm went off because the player took it. */
  | { type: 'carAlarm'; vehicle: GameVehicle };

export type EventType = GameEvent['type'];
type Handler<T extends EventType> = (e: Extract<GameEvent, { type: T }>) => void;

export class EventBus {
  private handlers = new Map<string, ((e: GameEvent) => void)[]>();
  /** The last few events (newest last), handy for tests and for a future "what just happened" log. */
  readonly recent: GameEvent[] = [];

  /** Listen for one kind of event. Returns a function that stops listening. */
  on<T extends EventType>(type: T, fn: Handler<T>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (e: GameEvent) => void);
    this.handlers.set(type, list);
    return () => { const l = this.handlers.get(type); if (l) { const i = l.indexOf(fn as (e: GameEvent) => void); if (i >= 0) l.splice(i, 1); } };
  }

  emit(e: GameEvent): void {
    this.recent.push(e);
    if (this.recent.length > 40) this.recent.shift();
    const list = this.handlers.get(e.type);
    if (list) for (const fn of [...list]) fn(e);
  }
}
