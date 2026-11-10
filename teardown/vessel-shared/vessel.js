// The ASV-7, built from code in metres: a 7.0 m deep-V hull (lofted from stations), the deck and equipment pod, the
// sensor mast with the compass/IMU that feeds the autopilot, the autopilot computer in its bay, the inboard engine,
// shaft and propeller, and the steering: rudder, stock, tiller and the hydraulic ram that drives it.
// update(state) poses everything from one logged sample: rudder angle, prop speed, compass valid, software mode.
// Frame: bow toward +z, starboard toward -x, waterline at y = 0. Positive rudder turns the bow to starboard.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const smooth = (x) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export const V = {
  loa: 7.0,
  beam: 2.4,
  draft: 0.45, // hull bottom below the waterline, aft
  sheerAft: 0.6,
  sheerBow: 0.95,
  rudder: {z: -3.02, top: -0.42, bottom: -0.98, chord: 0.42, limit: 35},
  prop: {z: -2.62, y: -0.66, r: 0.22},
  stockTop: 0.22,
  tillerLen: 0.32,
  ramAnchor: new V3(0.78, 0.22, -2.62),
  mast: {x: 0, z: 0.05, base: 1.12, top: 2.45},
};

// ------------------------------------------------------------ the hull: stations from the transom (s = 0) to the bow (s = 1)
export function station(s) {
  const z = -V.loa / 2 + s * V.loa;
  const hb = s < 0.55 ? (V.beam / 2) * (0.93 + (0.07 * s) / 0.55) : (V.beam / 2) * Math.sqrt(Math.max(0, 1 - ((s - 0.55) / 0.45) ** 2));
  const ys = V.sheerAft + (V.sheerBow - V.sheerAft) * smooth((s - 0.35) / 0.65);
  const yk = s < 0.6 ? -V.draft : -V.draft + (ys + V.draft) * Math.pow((s - 0.6) / 0.4, 1.7);
  return {z, hb, ys, yk};
}
// half a section, keel to sheer: a straight deadrise to the chine, then a flared topside
function halfSection({hb, ys, yk}) {
  const pts = [];
  const xc = hb * 0.9;
  const yc = yk + (ys - yk) * 0.36;
  for (let i = 0; i <= 5; i++) pts.push([(xc * i) / 5, yk + ((yc - yk) * i) / 5]);
  for (let i = 1; i <= 5; i++) {
    const v = i / 5;
    pts.push([xc + (hb - xc) * Math.sqrt(v), yc + (ys - yc) * v]);
  }
  return pts;
}
function hullGeo() {
  const NS = 56;
  const pos = [];
  const col = [];
  const idx = [];
  const bottom = new THREE.Color('#33424e');
  const top = new THREE.Color('#f2f1ec');
  const boot = new THREE.Color('#1f2a30');
  let row = 0;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const st = station(s);
    const half = halfSection(st);
    // starboard (-x) sheer down to the keel, then up to the port sheer
    const sec = [...half.slice().reverse().map(([x, y]) => [-x, y]), ...half.slice(1)];
    row = sec.length;
    for (const [x, y] of sec) {
      pos.push(x, y, st.z);
      const c = y < 0.02 ? bottom : y < 0.1 ? boot : top;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // the transom: a fan from its centre
  const c0 = pos.length / 3;
  const t0 = station(0);
  pos.push(0, (t0.ys + t0.yk) / 2, t0.z);
  col.push(top.r, top.g, top.b);
  for (let j = 0; j < row - 1; j++) idx.push(c0, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// the deck: a cambered strip between the sheers, a little in from them
function deckGeo() {
  const NS = 56;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= NS; i++) {
    const st = station(i / NS);
    const w = Math.max(0, st.hb - 0.04);
    pos.push(-w, st.ys - 0.01, st.z, 0, st.ys + 0.05 * (w / (V.beam / 2)), st.z, w, st.ys - 0.01, st.z);
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// the rudder blade: a NACA-ish foil extruded downward, pivot at 25% chord
function rudderGeo() {
  const {chord, top, bottom} = V.rudder;
  const t = 0.11 * chord;
  const sh = new THREE.Shape();
  const N = 16;
  const up = [];
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    const y = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    up.push([x * chord, y]);
  }
  up.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  for (let i = N; i >= 0; i--) sh.lineTo(up[i][0], -up[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, {depth: top - bottom, bevelEnabled: false, curveSegments: 4});
  // shape x along the chord (aft), shape y athwartships, depth downward
  g.translate(-0.25 * chord, 0, 0);
  g.rotateX(Math.PI / 2); // depth -> -y
  g.rotateY(Math.PI / 2); // chord -> -z (aft)
  g.translate(0, top, 0);
  return g;
}
function bladeGeo(r) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(r * 0.35, r * 0.15, r * 0.95, r * 0.25, r, 0);
  sh.bezierCurveTo(r * 0.9, -r * 0.3, r * 0.3, -r * 0.25, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, {depth: 0.01, bevelEnabled: false});
  g.translate(0, 0, -0.005);
  return g;
}

export function buildVessel() {
  const M = {
    hull: new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide}),
    deck: new THREE.MeshStandardMaterial({color: '#e4e1d8', roughness: 0.75, side: THREE.DoubleSide}),
    white: new THREE.MeshPhysicalMaterial({color: '#f3f2ee', roughness: 0.4, clearcoat: 0.3}),
    glass: new THREE.MeshPhysicalMaterial({color: '#25333c', roughness: 0.15, metalness: 0.1, clearcoat: 1}),
    dark: new THREE.MeshPhysicalMaterial({color: '#1d2329', roughness: 0.45, metalness: 0.2, clearcoat: 0.3}),
    engine: new THREE.MeshStandardMaterial({color: '#4c6b80', roughness: 0.5, metalness: 0.3}),
    steel: new THREE.MeshStandardMaterial({color: '#c3c8ce', roughness: 0.3, metalness: 1}),
    bronze: new THREE.MeshStandardMaterial({color: '#b0874a', roughness: 0.32, metalness: 0.9}),
    orange: new THREE.MeshPhysicalMaterial({color: '#e3562a', roughness: 0.35, clearcoat: 0.5}),
    rudder: new THREE.MeshPhysicalMaterial({color: '#e3562a', roughness: 0.38, clearcoat: 0.4}),
    led: new THREE.MeshBasicMaterial({color: '#2fa36b', toneMapped: false}),
    ring: new THREE.MeshBasicMaterial({color: '#2fa36b', toneMapped: false}),
  };
  const all = [];
  const add = (parent, geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    all.push(m);
    return m;
  };
  const root = new THREE.Group(); // yawed by the heading
  const body = new THREE.Group(); // heels a little into the turn
  root.add(body);

  // ------------------------------------------------------------ hull and deck
  const hull = new THREE.Group();
  body.add(hull);
  add(hull, hullGeo(), M.hull);
  const deck = new THREE.Group();
  body.add(deck);
  add(deck, deckGeo(), M.deck);
  // rub rail along the sheer
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const st = station(i / 40);
      pts.push(new V3(st.hb + 0.012, st.ys - 0.02, st.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const sx of [1, -1]) {
      const r = add(hull, new THREE.TubeGeometry(curve, 60, 0.025, 8), M.dark);
      r.scale.x = sx;
    }
  }

  // ------------------------------------------------------------ equipment pod and the sensor mast
  const pod = new THREE.Group();
  body.add(pod);
  add(pod, new RoundedBoxGeometry(1.35, 0.5, 1.7, 4, 0.12), M.white).position.set(0, 0.92, 0.25);
  add(pod, new RoundedBoxGeometry(1.37, 0.14, 1.2, 3, 0.05), M.glass).position.set(0, 1.04, 0.42);
  const mast = new THREE.Group();
  mast.position.set(V.mast.x, 0, V.mast.z);
  pod.add(mast);
  const mh = V.mast.top - V.mast.base;
  add(mast, new THREE.CylinderGeometry(0.035, 0.05, mh, 16), M.steel).position.y = V.mast.base + mh / 2;
  add(mast, new THREE.BoxGeometry(0.7, 0.03, 0.05), M.steel).position.y = V.mast.top - 0.35;
  // GPS dome to port, radar puck on top, a whip to starboard
  add(mast, new THREE.SphereGeometry(0.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.white).position.set(0.3, V.mast.top - 0.335, 0);
  add(mast, new THREE.CylinderGeometry(0.17, 0.17, 0.09, 32), M.white).position.y = V.mast.top + 0.045;
  add(mast, new THREE.CylinderGeometry(0.006, 0.01, 0.6, 6), M.dark).position.set(-0.3, V.mast.top - 0.04, 0);
  // the compass / IMU: a dark puck with a status ring, the heading source for the autopilot
  const compass = new THREE.Group();
  compass.position.y = V.mast.base + mh * 0.48;
  mast.add(compass);
  add(compass, new THREE.CylinderGeometry(0.11, 0.11, 0.07, 32), M.dark);
  const ring = add(compass, new THREE.TorusGeometry(0.115, 0.012, 8, 40), M.ring, false);
  ring.rotation.x = Math.PI / 2;
  add(compass, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), M.steel).position.y = -0.06;

  // ------------------------------------------------------------ the autopilot computer in its bay
  const computer = new THREE.Group();
  computer.position.set(0, 0.2, 0.9);
  body.add(computer);
  add(computer, new RoundedBoxGeometry(0.56, 0.2, 0.42, 3, 0.03), M.dark);
  add(computer, new THREE.BoxGeometry(0.6, 0.02, 0.46), M.steel).position.y = -0.11;
  for (let i = 0; i < 7; i++) add(computer, new THREE.BoxGeometry(0.012, 0.13, 0.36), M.dark).position.set(-0.24 + i * 0.08, 0.12, 0);
  const led = add(computer, new THREE.BoxGeometry(0.3, 0.025, 0.012), M.led, false);
  led.position.set(0, 0.04, 0.215);
  // the data bus from the compass down to the computer
  let bus;
  {
    const curve = new THREE.CatmullRomCurve3([new V3(0.02, V.mast.base + mh * 0.42, V.mast.z), new V3(0.05, 1.0, 0.2), new V3(0.08, 0.55, 0.6), new V3(0.1, 0.25, 0.85)]);
    bus = add(body, new THREE.TubeGeometry(curve, 40, 0.012, 6), M.orange, false);
  }

  // ------------------------------------------------------------ propulsion: engine, shaft, propeller
  const engine = new THREE.Group();
  engine.position.set(0, 0.0, -1.55);
  body.add(engine);
  add(engine, new RoundedBoxGeometry(0.62, 0.48, 0.85, 3, 0.05), M.engine).position.y = 0.05;
  add(engine, new RoundedBoxGeometry(0.5, 0.14, 0.7, 3, 0.03), M.steel).position.y = 0.36;
  add(engine, new THREE.CylinderGeometry(0.11, 0.11, 0.08, 24), M.dark).rotation.x = Math.PI / 2;
  engine.children[engine.children.length - 1].position.set(0, 0.02, 0.46);
  const drive = new THREE.Group();
  body.add(drive);
  const sFrom = new V3(0, -0.12, -1.98);
  const sTo = new V3(0, V.prop.y, V.prop.z);
  const shaft = add(drive, new THREE.CylinderGeometry(0.03, 0.03, sFrom.distanceTo(sTo), 12), M.steel);
  shaft.position.copy(sFrom).add(sTo).multiplyScalar(0.5);
  shaft.quaternion.setFromUnitVectors(new V3(0, 1, 0), sTo.clone().sub(sFrom).normalize());
  // strut under the hull
  add(drive, new THREE.BoxGeometry(0.03, 0.26, 0.12), M.bronze).position.set(0, -0.5, -2.44);
  const prop = new THREE.Group();
  prop.position.copy(sTo);
  prop.quaternion.copy(shaft.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), -Math.PI / 2));
  drive.add(prop);
  const spinner = new THREE.Group();
  prop.add(spinner);
  add(spinner, new THREE.CylinderGeometry(0.05, 0.065, 0.14, 16), M.bronze).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const b = add(spinner, bladeGeo(V.prop.r), M.bronze);
    b.rotation.z = (i / 3) * Math.PI * 2;
    b.rotation.y = 0.45;
  }

  // ------------------------------------------------------------ steering: rudder, stock, tiller, hydraulic ram
  const steer = new THREE.Group();
  body.add(steer);
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, 0, V.rudder.z);
  steer.add(rudderPivot);
  add(rudderPivot, rudderGeo(), M.rudder);
  add(rudderPivot, new THREE.CylinderGeometry(0.03, 0.03, V.stockTop - V.rudder.top + 0.02, 12), M.steel).position.y = (V.stockTop + V.rudder.top) / 2;
  // the tiller arm points to port (+x) when the rudder is midships
  const tiller = add(rudderPivot, new RoundedBoxGeometry(V.tillerLen + 0.08, 0.05, 0.07, 2, 0.015), M.steel);
  tiller.position.set(V.tillerLen / 2, V.stockTop, 0);
  const ram = new THREE.Group();
  steer.add(ram);
  const ramBody = add(ram, new THREE.CylinderGeometry(0.045, 0.045, 0.34, 20), M.white);
  const ramRod = add(ram, new THREE.CylinderGeometry(0.016, 0.016, 1, 12), M.steel);
  const ramEnd = add(ram, new THREE.SphereGeometry(0.03, 12, 8), M.orange);
  add(steer, new RoundedBoxGeometry(0.1, 0.12, 0.1, 2, 0.02), M.dark).position.copy(V.ramAnchor);
  // hose from the ram to the pump on the engine
  add(steer, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V.ramAnchor.clone().add(new V3(0, 0.05, 0.05)), new V3(0.6, 0.35, -2.2), new V3(0.3, 0.3, -1.95)]), 30, 0.012, 6), M.dark, false);

  // ------------------------------------------------------------ display modes
  let xrayNow = -1;
  const setXray = (k) => {
    if (Math.abs(k - xrayNow) < 1e-3) return;
    xrayNow = k;
    for (const m of [M.hull, M.deck]) {
      m.transparent = k > 0.001;
      m.opacity = 1 - 0.8 * k;
      m.depthWrite = k < 0.5;
      m.needsUpdate = true;
    }
  };
  const ok = new THREE.Color('#2fa36b');
  const bad = new THREE.Color('#e3562a');
  const off = new THREE.Color('#3a444b');
  const out = {tillerEnd: new V3()};
  const a = new V3();
  const b = new V3();

  /**
   * s: {rud (deg), spin (prop radians), meas (compass data valid), fault (software in safe mode), blink 0..1,
   *     heel (deg), xray 0..1, explode 0..1}
   */
  const update = (s) => {
    setXray(s.xray ?? 0);
    const e = s.explode ?? 0;
    deck.position.y = 0.75 * e;
    pod.position.y = 1.05 * e;
    mast.position.y = 0.2 * e;
    bus.visible = e < 0.02;
    computer.position.set(0, 0.2 + 0.85 * e, 0.9 + 0.3 * e);
    engine.position.set(0, 0.62 * e, -1.55);
    drive.position.set(0, -0.32 * e, -0.5 * e);
    steer.position.set(0, -0.05 * e, -0.95 * e);
    body.rotation.z = (s.heel ?? 0) * D2R;

    rudderPivot.rotation.y = (s.rud ?? 0) * D2R;
    spinner.rotation.z = s.spin ?? 0;
    // the ram follows the tiller end: body fixed at the anchor, rod out to the arm
    a.set(V.tillerLen * Math.cos((s.rud ?? 0) * D2R), V.stockTop, V.rudder.z - V.tillerLen * Math.sin((s.rud ?? 0) * D2R));
    b.copy(V.ramAnchor);
    out.tillerEnd.copy(a);
    const dir = a.clone().sub(b);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
    ramBody.quaternion.copy(q);
    ramBody.position.copy(b).addScaledVector(dir, 0.17);
    const rodLen = Math.max(0.02, len - 0.3);
    ramRod.scale.y = rodLen;
    ramRod.quaternion.copy(q);
    ramRod.position.copy(b).addScaledVector(dir, 0.3 + rodLen / 2);
    ramEnd.position.copy(a);

    // the compass ring: green with data, a blinking orange when it is lost
    M.ring.color.copy(s.meas === false ? (s.blink > 0.5 ? bad : off) : ok);
    // the computer's status light reports what the SOFTWARE believes: safe mode orange, otherwise green
    M.led.color.copy(s.fault ? bad : ok);
  };
  update({});
  return {root, body, update, M, all, hull, deck, pod, mast, compass, computer, engine, drive, steer, rudderPivot, ram, out};
}
