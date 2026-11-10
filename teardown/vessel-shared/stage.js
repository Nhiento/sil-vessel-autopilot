// The vessel's stage: a pale studio sea (a survey grid and swell lines drawn in a shader that slides under the boat by
// the distance it has run), the wake it has left over the last 45 s, the commanded course (orange, dashed) and the
// actual heading (ink) laid on the water from the bow, soft shadows and GTAO kept off the water.
// frame(state, cam) poses the boat from one logged sample and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildVessel} from './vessel.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
export const COL = {bg: '#e6edef', water: '#d6e3e8', mark: '#b9cdd5', ink: '#1f2a30', or: '#e3562a', shadow: '#36505e'};

const WATER_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = /* glsl */ `uniform vec3 uW; uniform vec3 uM; uniform vec3 uBg; uniform vec2 uOff; uniform vec3 uC; uniform float uA; varying vec3 vW;
  float line(float v, float w){ float d = abs(fract(v) - 0.5); return 1.0 - smoothstep(w, w + 0.02, 0.5 - d); }
  void main(){
    // world position on the sea: the boat sits at the origin, the sea moves under it
    vec2 p = vW.xz + uOff;
    float m = 0.0;
    // survey grid every 4 m, a finer one every 1 m
    m = max(m, 0.9 * max(line(p.x / 4.0, 0.012), line(p.y / 4.0, 0.012)));
    m = max(m, 0.35 * max(line(p.x, 0.02), line(p.y, 0.02)));
    // long swell lines running across the grid
    float sw = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + sin(p.x * 0.17) * 1.5);
    m = max(m, 0.28 * (1.0 - smoothstep(0.0, 0.08, abs(sw - 0.92))));
    vec3 col = mix(uW, uM, m);
    float d = length(vW.xz - uC.xz);
    gl_FragColor = vec4(mix(col, uBg, smoothstep(9.0, 30.0, d)), uA);
  }`;

// a flat ribbon on the water through a list of points, fading along its length (wake, course lines)
const RIB_VERT = /* glsl */ `attribute float aF; varying float vF; void main(){ vF = aF; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FRAG = /* glsl */ `uniform vec3 uCol; uniform float uA; varying float vF; void main(){ gl_FragColor = vec4(uCol, uA * vF); }`;
function ribbon(maxPts, col, alpha) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3));
  g.setAttribute('aF', new THREE.BufferAttribute(new Float32Array(maxPts * 2), 1));
  const idx = [];
  for (let i = 0; i < maxPts - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms: {uCol: {value: new THREE.Color(col)}, uA: {value: alpha}}, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8});
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  // pts: [[x, z, fade], ...], w: half width
  mesh.set = (pts, w, y = 0.012) => {
    const P = g.attributes.position.array;
    const F = g.attributes.aF.array;
    const n = Math.min(maxPts, pts.length);
    for (let i = 0; i < n; i++) {
      const [x, z, f] = pts[i];
      const [x2, z2] = pts[Math.min(n - 1, i + 1)];
      const [x0, z0] = pts[Math.max(0, i - 1)];
      let dx = x2 - x0;
      let dz = z2 - z0;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      P.set([x - dz * w, y, z + dx * w, x + dz * w, y, z - dx * w], i * 6);
      F[i * 2] = F[i * 2 + 1] = f;
    }
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    g.attributes.position.needsUpdate = true;
    g.attributes.aF.needsUpdate = true;
  };
  return mesh;
}

export function createVesselStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 22, 60);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.7;
  gtao.updateGtaoMaterial({radius: 0.25, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  const overlays = [];
  const seaVis = (v) => () => {
    water.visible = v;
    shade.visible = v;
    for (const o of overlays) o.visible = v && o.userData.on !== false;
  };
  composer.addPass(new Toggle(seaVis(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(seaVis(true)));
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e3ebee');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(0.97, 0.99, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.4);
    box(3, 14, new V3(-12, 4, 6), 3.0);
    box(3, 14, new V3(12, 4, -4), 2.0);
    box(18, 2, new V3(0, 2, 14), 1.5);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#b9c9cf', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const SUN_DIR = new V3(-0.4, 0.8, 0.45).normalize();
  const sun = new THREE.DirectionalLight('#fffaf2', 2.2);
  sun.castShadow = true;
  const EXT = 5.5;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.5, far: 30});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.position.copy(SUN_DIR).multiplyScalar(14);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fbfdff', '#b7c8cf', 0.7));

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {uW: {value: new THREE.Color(COL.water)}, uM: {value: new THREE.Color(COL.mark)}, uBg: {value: new THREE.Color(COL.bg)}, uOff: {value: new THREE.Vector2()}, uC: {value: new V3()}, uA: {value: 0.86}},
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = 2;
  scene.add(water);
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.002;
  shade.receiveShadow = true;
  shade.renderOrder = 3;
  scene.add(shade);

  const vessel = buildVessel();
  scene.add(vessel.root);

  // the wake, the commanded course and the actual heading on the water
  const wake = ribbon(260, '#ffffff', 0.6);
  const wakeCore = ribbon(260, COL.ink, 0.18);
  const course = ribbon(64, COL.or, 0.95);
  const actual = ribbon(2, COL.ink, 0.75);
  for (const o of [wake, wakeCore, course, actual]) {
    scene.add(o);
    overlays.push(o);
  }
  const arrowHead = (col) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.55);
    sh.lineTo(0.32, 0);
    sh.lineTo(-0.32, 0);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 1, -1);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
    m.renderOrder = 6;
    scene.add(m);
    overlays.push(m);
    return m;
  };
  const courseHead = arrowHead(COL.or);
  const actualHead = arrowHead(COL.ink);
  const R0 = 4.6;
  const R1 = 13.5;
  const along = (deg, r) => [-Math.sin(deg * D2R) * r, Math.cos(deg * D2R) * r];

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  /**
   * st: {hdg, sp, rud, x, z (position on the sea), trail [[x,z,f]...], spin, meas, fault, blink, heel, xray, explode,
   *      wake 0..1, course 0..1}
   * cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy}: the target is relative to the boat, az in the world frame
   */
  const frame = (st, cam) => {
    vessel.root.rotation.y = -st.hdg * D2R;
    vessel.update(st);
    waterMat.uniforms.uOff.value.set(st.x ?? 0, st.z ?? 0);

    const wk = st.wake ?? 1;
    wake.userData.on = wakeCore.userData.on = wk > 0.01;
    if (st.trail && wk > 0.01) {
      // the wake starts at the transom, not under the hull
      const T = st.trail.map(([x, z, f]) => [x, z, Math.max(0, 1 - f) * wk]);
      const [ax, az] = along(st.hdg, -3.4);
      T[T.length - 1] = [ax, az, wk];
      wake.set(T, 0.55);
      wakeCore.set(T, 0.08, 0.014);
    }
    const ck = st.course ?? 1;
    for (const o of [course, actual, courseHead, actualHead]) o.userData.on = ck > 0.01;
    course.material.uniforms.uA.value = 0.95 * ck;
    actual.material.uniforms.uA.value = 0.75 * ck;
    courseHead.material.opacity = actualHead.material.opacity = 0.95 * ck;
    {
      // the commanded course: dashes from just past the bow
      const pts = [];
      const n = 30;
      for (let i = 0; i < n; i++) {
        const r = R0 + ((R1 - R0) * i) / (n - 1);
        const [x, z] = along(st.sp, r);
        const on = Math.floor(i / 2) % 2 === 0 ? 1 : 0;
        pts.push([x, z, on]);
      }
      course.set(pts, 0.07, 0.02);
      const [hx, hz] = along(st.sp, R1);
      courseHead.position.set(hx, 0.02, hz);
      courseHead.rotation.y = -st.sp * D2R;
      actual.set([[...along(st.hdg, R0), 1], [...along(st.hdg, R1 - 0.6), 1]], 0.05, 0.018);
      const [ax2, az2] = along(st.hdg, R1 - 0.6);
      actualHead.position.set(ax2, 0.018, az2);
      actualHead.rotation.y = -st.hdg * D2R;
      actualHead.scale.setScalar(0.8);
    }
    for (const o of overlays) o.visible = o.userData.on !== false;

    const tx = cam.tx;
    const ty = cam.ty;
    const tz = cam.tz;
    camera.position.set(tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), ty + cam.d * Math.sin(cam.el), tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    waterMat.uniforms.uC.value.set(tx, 0, tz);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, vessel, composer, gtao, sun, resize, frame, project, size, setQuality};
}
