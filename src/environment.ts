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

  private shadowSize = 40;
  private tmpRight = new THREE.Vector3();
  private tmpUp = new THREE.Vector3();
  private tmpSnap = new THREE.Vector3();

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
  }

  private apply(): void {
    const c = this.cur;
    this.fog.color.copy(c.horizon);
    this.fog.density = c.fog;
    this.scene.background = null;
    this.skyMat.uniforms.top.value = c.skyTop;
    this.skyMat.uniforms.bottom.value = c.horizon;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunIntensity;
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiIntensity;
    this.night = c.night;
  }
}
