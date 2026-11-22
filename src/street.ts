import type { Game } from './game';
import { bi } from './i18n';
import type { GameVehicle } from './vehicles';

const SHOUTS: [string, string][] = [['Help!', '도와줘요!'], ['Call the police!', '경찰 불러요!'], ['Run!', '도망쳐!'], ['Oh no!', '이럴 수가!'], ['He is crazy!', '미쳤어요!'], ['Somebody stop him!', '누가 좀 말려요!']];

/** Life on the street: crowds panicking at crimes and gunfire, car alarms, the city hum and the odd car horn. */
export class StreetLife {
  private clock = 0;
  private crowdT = -99;
  private shotT = -99;
  private alarmT = 0;
  private alarmBeep = 0;
  private alarmCar: GameVehicle | null = null;
  private hornT = 6;

  constructor(private game: Game) {}

  /** A gun went off: people nearby panic (at most every 1.5 s). */
  gunshot(x: number, z: number): void {
    if (this.clock - this.shotT < 1.5) return;
    this.shotT = this.clock;
    this.crowdReacts(x, z, 28);
  }

  /** The people around a crime run, shout, and sometimes scream. */
  crowdReacts(x: number, z: number, r = 32): void {
    const G = this.game;
    for (const h of G.humans.panic(x, z, r)) {
      const [en, ko] = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
      G.popups.spawn(h.x, h.y + 2.6, h.z, bi(en, ko), '#ffffff');
    }
    if (this.clock - this.crowdT > 2.5) { this.crowdT = this.clock; if (G.nearPlayer(x, z, 45)) G.audio.scream(); }
  }

  /** Taking a parked car sometimes sets off its alarm: noise, a little heat, and a witness may phone it in. */
  carAlarm(v: GameVehicle): void {
    const G = this.game;
    this.alarmT = 7; this.alarmCar = v; this.alarmBeep = 0;
    G.addHeat(12);
    if (G.stars === 0) G.humans.startWitnesses(v.x, v.z, 25, 1);
    G.hud.toast(bi('The car alarm goes off!', '도난 경보가 울려요!'), 2200);
  }

  updateAmbience(dt: number): void {
    const G = this.game;
    this.clock += dt;
    const d = G.driving;
    // city hum: more traffic and people around you, more rumble (nothing inside a shop)
    let near = 0;
    for (const v of G.vehicles) if (v !== d && Math.abs(v.x - G.focusX) < 70 && Math.abs(v.z - G.focusZ) < 70) near++;
    G.audio.setCity(G.inside ? 0.05 : Math.min(1, 0.2 + near * 0.06));
    if (this.alarmT > 0 && this.alarmCar) {
      this.alarmT -= dt; this.alarmBeep -= dt;
      if (this.alarmBeep <= 0) { this.alarmBeep = 0.75; G.audio.horn(Math.hypot(this.alarmCar.x - G.focusX, this.alarmCar.z - G.focusZ), 1.25); }
    }
    // now and then a nearby driver leans on the horn, mostly when they are stuck behind something
    this.hornT -= dt;
    if (this.hornT <= 0 && !G.inside && G.state === 'play') {
      this.hornT = 5 + Math.random() * 9;
      const cands = G.vehicles.filter((v) => v.ai === 'traffic' && !v.isPolice && Math.hypot(v.x - G.focusX, v.z - G.focusZ) < 55 && (v.ctrl.speed < 1.5 || Math.random() < 0.15));
      if (cands.length) {
        const v = cands[Math.floor(Math.random() * cands.length)];
        G.audio.horn(Math.hypot(v.x - G.focusX, v.z - G.focusZ), 0.9 + Math.random() * 0.3);
      }
    }
  }
}
