import type { Game } from './game';
import { bi } from './i18n';
import type { Room } from './interiors';

/**
 * Going into shops and the garage and being inside one. Entering and leaving fade the screen; while you are inside only you move (the street is
 * frozen far away). The game keeps `inside` and `ret` (where to come back out) because the rest of the game asks about them.
 */
export class Insides {
  constructor(private game: Game) {}

  enter(room: Room): void {
    const G = this.game;
    if (G.fading || G.state !== 'play') return;
    if (this.closed(room)) { G.hud.toast(bi('Closed for the night - open again in the daytime.', '밤에는 문을 닫았어요 - 낮에 다시 오세요.'), 2400); return; }
    if (G.stars > 0 && !((room.id === 'garage' || room.id === 'home') && G.hideouts.canHide())) { G.hud.toast(room.id === 'garage' || room.id === 'home' ? bi('The police are too close to hide!', '경찰이 너무 가까워서 숨을 수 없어요!') : bi('The door is locked - the police are watching!', '문이 잠겨 있어요 - 경찰이 지켜보고 있어요!'), 2400); return; }
    const pl = G.humans.player;
    G.ret = { x: pl.x, z: pl.z, h: pl.heading };
    G.progress.add('shops');
    G.fadeThen(() => {
      G.inside = room;
      if (room.id === 'garage') G.hideouts.parkCarInBay(room);
      G.humans.setPlayerActive(true, room.exit.x, room.exit.z - 2.2, Math.PI);
      G.cameraRig.ignore = null;
      G.syncFoot();
      G.cameraRig.snap();
      G.hud.toast(`${bi(room.en, room.ko)}`, 1800);
    });
  }

  leave(): void {
    const G = this.game;
    G.fadeThen(() => {
      const r = G.ret;
      if (G.inside?.id === 'garage') G.hideouts.returnCarToStreet();
      G.inside = null;
      document.body.classList.remove('can-rob');
      G.humans.setPlayerActive(true, r.x, r.z, r.h);
      G.syncFoot();
      G.cameraRig.snap();
    });
  }

  update(dt: number): void {
    const G = this.game;
    const room = G.inside!;
    const input = G.input;
    const pl = G.humans.player;
    const look = input.takeLook();
    G.cameraRig.applyLook(look.x, look.y);
    const playing = G.state === 'play' && !G.fading;
    G.humans.update(dt, {
      input: playing ? input : G.idleInput, camYaw: G.cameraRig.moveYaw, vehicles: [], wantCops: 0, wantRiot: 0, playerActive: true,
      playerCarX: pl.x, playerCarZ: pl.z, playerCarSpeed: 0, policeCars: [], time: G.time,
    });
    G.syncFoot();
    G.hideouts.spin(dt);
    G.popups.update(dt);
    G.slash.update(dt);
    G.guns.tick(dt);
    G.interiors.update(dt);
    if ((room.id === 'garage' || room.id === 'home') && G.stars > 0) G.hideouts.hideDecay(dt);
    if (room.id === 'bank') G.shops.updateHeist(dt, room);
    if (playing && (input.wasPressed('KeyF') || input.wasPressed('KeyE'))) {
      if (Math.hypot(pl.x - room.exit.x, pl.z - room.exit.z) < 2.4) this.leave();
      else if (room.id === 'bank' && G.shops.vaultNear(room)) G.shops.startHeist();
      else if (room.id === 'home' && G.shops.wardrobeNear(room)) G.hideouts.wardrobe();
      else if (G.shops.deskNear(room)) G.shops.deskAction(room);
      else if (Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4) G.shops.action(room);
    }
    if (playing && input.wasPressed('KeyG') && Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4) G.shops.rob(room);
    if (playing && room.id === 'arcade' && input.wasPressed('KeyH')) G.shops.startBowling();
    G.shops.updateBowling(dt, room);
    G.input.gunOut = false; G.cameraRig.aimMode = 0; G.guns.aimPoint = null; G.hud.setCrosshair(false); G.hud.setLockOn(false); G.hud.setGunOut(false);
    G.hud.setPrompt(G.state === 'play' ? G.shops.prompt(room) : null);
    document.body.classList.toggle('can-rob', G.shops.canRob(room) && Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4);
    G.progress.tick(dt);
    G.updateLights();
    G.hud.update(G.followable, 1, 1, false, [], dt);
    G.hud.setNav(null, ''); G.hud.setRoute(null);
    G.hud.setFootMode(true, pl.weapon, G.humans.ownedFlags());
    G.hud.setAmmo(G.guns.hudText());
    G.hud.setReloadButton(false);
    G.hud.setPlayerHp(Math.max(0, pl.hp / pl.maxHp));
    G.hud.setPlayerArmor(G.humans.armor / 50);
    G.hud.setWantedBanner(false);
    if (G.saveDirty) { G.saveTimer -= dt; if (G.saveTimer <= 0) { G.flushSave(); G.saveTimer = 3; } }
  }

  /** Some shops shut at night (not for their owner). */
  closed(room: Room): boolean {
    const G = this.game;
    if (G.env.night < 0.7 || (room.id !== 'clothes' && room.id !== 'donut')) return false;
    return !G.progress.owned.includes(room.id as never);
  }
}
