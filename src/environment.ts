import * as THREE from 'three';

export type TimeOfDay = 'noon' | 'sunset' | 'night';
export const TIMES: TimeOfDay[] = ['noon', 'sunset', 'night'];

interface Preset {
  skyTop: THREE.Color;
  horizon: THREE.Color;
  fog: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  night: number;
}

const P = (
  top: number, hor: number, fog: number, sun: number, sunI: number, dir: [number, number, number],
  hs: number, hg: number, hi: number, night: number,
): Preset => ({
  skyTop: new THREE.Color(top), horizon: new THREE.Color(hor), fog,
  sunColor: new THREE.Color(sun), sunIntensity: sunI, sunDir: new THREE.Vector3(...dir).normalize(),
  hemiSky: new THREE.Color(hs), hemiGround: new THREE.Color(hg), hemiIntensity: hi, night,
});

const PRESETS: Record<TimeOfDay, Preset> = {
  noon: P(0x1e90ff, 0xaee2ff, 0.0032, 0xfff4e0, 2.7, [0.45, 0.85, 0.3], 0x87ceeb, 0xe8c39e, 1.15, 0),
  sunset: P(0x5b4b9a, 0xffb07a, 0.0042, 0xff7e47, 2.3, [-0.85, 0.28, 0.4], 0xb58bc9, 0xe8a070, 0.85, 0.35),
  night: P(0x070b24, 0x1c2450, 0.0042, 0x8fb0ff, 1.0, [0.3, 0.7, -0.35], 0x4a62b8, 0x2c2c58, 1.25, 1),
};

const GREY_TOP = new THREE.Color(0x5f6877);
const GREY_HOR = new THREE.Color(0x98a1ae);
const FLASH = new THREE.Color(0xe8f0ff);

/** Sky dome, 2-light core rig (hemisphere + directional sun/moon), fog, and smooth time-of-day blending. */
export class Environment {
  readonly scene: THREE.Scene;
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  readonly fog = new THREE.FogExp2(0xaee2ff, 0.003);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly cur: Preset;
  private target: Preset;
  /** 0 = day, 1 = full night. Drives emissive night lighting. */
  night = 0;
  timeOfDay: TimeOfDay = 'noon';

  private wDim = 0; private wFog = 0; private wGrey = 0; private wFlash = 0;
  private tmpTop = new THREE.Color();
  private tmpHor = new THREE.Color();
  private shadowSize = 40;
  private tmpRight = new THREE.Vector3();
  private tmpUp = new THREE.Vector3();
  private tmpSnap = new THREE.Vector3();
  /** Low-poly clouds drifting across the sky (they follow the camera, so the sky never runs out of them). */
  private clouds = new THREE.Group();
  private cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.95, depthWrite: false });
  private cloudList: { m: THREE.Mesh; x: number; z: number; speed: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const start = PRESETS.noon;
    this.cur = {
      skyTop: start.skyTop.clone(), horizon: start.horizon.clone(), fog: start.fog,
      sunColor: start.sunColor.clone(), sunIntensity: start.sunIntensity, sunDir: start.sunDir.clone(),
      hemiSky: start.hemiSky.clone(), hemiGround: start.hemiGround.clone(), hemiIntensity: start.hemiIntensity,
      night: start.night,
    };
    this.target = start;

    scene.fog = this.fog;
    scene.add(this.hemi);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowSize / 2;
    cam.right = this.shadowSize / 2;
    cam.top = this.shadowSize / 2;
    cam.bottom = -this.shadowSize / 2;
    cam.near = 1;
    cam.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: this.cur.skyTop }, bottom: { value: this.cur.horizon } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    {
      // one puffy cloud shape (a few merged low-poly blobs, white on top and bluish-grey underneath), reused for every cloud
      const parts: THREE.BufferGeometry[] = [];
      const blobs: [number, number, number, number][] = [[0, 0, 0, 34], [38, -4, 6, 26], [-40, -6, -4, 24], [14, 14, -6, 24], [-16, 10, 10, 20]];
      for (const [x, y, z, r] of blobs) {
        const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
        g.scale(1, 0.62, 1); g.translate(x, y, z);
        const pos = g.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const up = pos.getY(i) > y - 2;
          col[i * 3] = up ? 1 : 0.78; col[i * 3 + 1] = up ? 1 : 0.83; col[i * 3 + 2] = up ? 1 : 0.9;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      }
      let total = 0;
      for (const g of parts) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
      let o = 0;
      for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o * 3); col.set(g.attributes.color.array as Float32Array, o * 3); o += g.attributes.position.count; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(geo, this.cloudMat);
        const ang = Math.random() * Math.PI * 2, rad = 160 + Math.random() * 300;
        const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        m.position.set(x, 150 + Math.random() * 70, z);
        m.scale.setScalar(0.7 + Math.random() * 0.9);
        m.rotation.y = Math.random() * 3;
        m.frustumCulled = false; m.renderOrder = -1;
        this.clouds.add(m);
        this.cloudList.push({ m, x, z, speed: 2 + Math.random() * 3 });
      }
      scene.add(this.clouds);
    }
    scene.add(this.sky);

    this.apply();
  }

  setTime(t: TimeOfDay, instant = false): void {
    this.timeOfDay = t;
    this.target = PRESETS[t];
    if (instant) {
      const c = this.cur, p = this.target;
      c.skyTop.copy(p.skyTop); c.horizon.copy(p.horizon); c.fog = p.fog;
      c.sunColor.copy(p.sunColor); c.sunIntensity = p.sunIntensity; c.sunDir.copy(p.sunDir);
      c.hemiSky.copy(p.hemiSky); c.hemiGround.copy(p.hemiGround); c.hemiIntensity = p.hemiIntensity;
      c.night = p.night;
      this.apply();
    }
  }

  cycleTime(): TimeOfDay {
    const next = TIMES[(TIMES.indexOf(this.timeOfDay) + 1) % TIMES.length];
    this.setTime(next);
    return next;
  }

  /** Weather look: dimmer sun, thicker fog, greyer sky, and a lightning flash. */
  setWeather(dim: number, fog: number, grey: number, flash: number): void {
    this.wDim = dim; this.wFog = fog; this.wGrey = grey; this.wFlash = flash;
    this.apply();
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    const k = 1 - Math.exp(-dt * 1.8);
    const c = this.cur, p = this.target;
    c.skyTop.lerp(p.skyTop, k);
    c.horizon.lerp(p.horizon, k);
    c.fog += (p.fog - c.fog) * k;
    c.sunColor.lerp(p.sunColor, k);
    c.sunIntensity += (p.sunIntensity - c.sunIntensity) * k;
    c.sunDir.lerp(p.sunDir, k).normalize();
    c.hemiSky.lerp(p.hemiSky, k);
    c.hemiGround.lerp(p.hemiGround, k);
    c.hemiIntensity += (p.hemiIntensity - c.hemiIntensity) * k;
    c.night += (p.night - c.night) * k;
    this.apply();

    // Player-following shadow frustum with texel snapping in light space.
    const d = c.sunDir;
    this.tmpRight.set(0, 1, 0).cross(d).normalize();
    this.tmpUp.crossVectors(d, this.tmpRight).normalize();
    const texel = this.shadowSize / this.sun.shadow.mapSize.x;
    const px = focus.dot(this.tmpRight);
    const py = focus.dot(this.tmpUp);
    const sx = Math.round(px / texel) * texel - px;
    const sy = Math.round(py / texel) * texel - py;
    this.tmpSnap.copy(focus).addScaledVector(this.tmpRight, sx).addScaledVector(this.tmpUp, sy);
    this.sun.target.position.copy(this.tmpSnap);
    this.sun.position.copy(this.tmpSnap).addScaledVector(d, 80);
    this.sun.target.updateMatrixWorld();

    this.sky.position.copy(camera.position);
    // clouds drift on a slow wind and wrap round the camera
    this.clouds.position.set(camera.position.x, 0, camera.position.z);
    for (const c of this.cloudList) {
      c.x += c.speed * dt;
      if (c.x > 460) c.x = -460;
      c.m.position.x = c.x;
    }
  }

  private apply(): void {
    const c = this.cur;
    const lit = 1 - c.night * 0.85; // grey skies are darker at night
    this.tmpTop.copy(c.skyTop).lerp(GREY_TOP, this.wGrey * 0.7 * lit);
    this.tmpHor.copy(c.horizon).lerp(GREY_HOR, this.wGrey * 0.7 * lit);
    if (this.wFlash > 0.02) { this.tmpTop.lerp(FLASH, this.wFlash * 0.6); this.tmpHor.lerp(FLASH, this.wFlash * 0.6); }
    this.fog.color.copy(this.tmpHor);
    this.fog.density = c.fog * (1 + this.wFog * 3);
    this.scene.background = null;
    this.skyMat.uniforms.top.value = this.tmpTop;
    this.skyMat.uniforms.bottom.value = this.tmpHor;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunIntensity * (1 - 0.6 * this.wDim);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiIntensity * (1 - 0.15 * this.wDim) + this.wFlash * 1.6;
    this.night = c.night;
    // clouds take the colour of the horizon at sunset and night, and go grey in bad weather
    this.cloudMat.color.setRGB(1, 1, 1).lerp(this.tmpHor, 0.2 + c.night * 0.55 + this.wGrey * 0.3);
    this.cloudMat.opacity = Math.min(1, 0.85 + this.wGrey * 0.15);
  }
}
