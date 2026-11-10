// ASV-7 autopilot, the SIL replay film: the boat (vessel.js) on the studio sea (stage.js) under the test console
// (console.js). The operator replays the 90° turn on build v1.0 (overshoot: integrator windup) and v1.1 (fixed), then
// the compass dropout on v1.0 (rudder stays hard over on stale data, software still "NORMAL") and v1.1 (fault caught,
// rudder midships), and ends on the boat x-rayed and exploded with its subsystems labelled. A pure function of t.
import {runSim} from 'teardown-kit/runtime.js';
import * as THREE from 'three';
import {createConsole, DISPLAY} from './console.js';
import {checksAt, phaseAt, RUNS, sampleAt, trail} from './log.js';
import {createVesselStage} from './stage.js';
import {V} from './vessel.js';

export const SCRIPT = [
  {t: 0, run: 'S02-v1.0', rate: 4, view: 'hero'},
  {t: 3.2, view: 'top'},
  {t: 11.2, run: 'S02-v1.1', rate: 4},
  {t: 19.6, run: 'S05-v1.0', rate: 2.2, view: 'mast'},
  {t: 25.0, view: 'rudder'},
  {t: 28.8, run: 'S05-v1.1', rate: 2.2, view: 'mast'},
  {t: 34.4, view: 'rudder'},
  {t: 37.4, view: 'hero'},
  {t: 38.0, display: 'xray'},
  {t: 39.4, display: 'exploded'},
  {t: 40.6, display: 'labels'},
  {t: 41.4, display: 'orbit'},
  {t: 47.0, display: 'labels'},
  {t: 47.4, display: 'exploded'},
  {t: 48.4, display: 'xray'},
];
export const DURATION = 50;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'asv-7', subtitle: ''}, director: {enabled: false}, watermark: ''};
// display toggles that start switched on
export const DISPLAY_ON = {wake: 1, course: 1};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the run and the display toggles at film time t
export const runAt = (t) => {
  const e = SCRIPT.filter((x) => x.run && x.t <= t).pop();
  const r = RUNS[e.run];
  return {id: e.run, tau: Math.min(r.duration, (t - e.t) * e.rate), rate: e.rate};
};
export const displayAt = (t) => {
  const out = Object.fromEntries(DISPLAY.map((k) => [k, DISPLAY_ON[k] ?? 0]));
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
const lastFlip = (key, t) => SCRIPT.filter((e) => e.display === key && e.t <= t).pop()?.t ?? -9;
export const easedDisplay = (key, t, dur = 0.7) => {
  const on = displayAt(t)[key];
  const k = ss(lastFlip(key, t), lastFlip(key, t) + dur, t);
  return on ? k : 1 - k;
};

// ------------------------------------------------------------ the boat's state from one logged sample
export function boatState(r, tau, clock) {
  const m = sampleAt(r, tau);
  const rate = (sampleAt(r, tau + 0.5).hdg - sampleAt(r, Math.max(0, tau - 0.5)).hdg) / (tau > 0.5 ? 1 : 0.5 + tau);
  return {
    m,
    st: {
      hdg: m.hdg,
      sp: m.sp,
      rud: m.rud,
      x: m.x,
      z: m.z,
      trail: trail(r, tau),
      spin: tau * m.spd * 1.6,
      meas: m.meas,
      fault: m.fault,
      blink: Math.floor(clock * 3.2) % 2,
      heel: Math.max(-7, Math.min(7, -1.6 * rate)),
    },
  };
}

// ------------------------------------------------------------ views: the target relative to the boat; f is how much
// the camera turns with the boat (0: north up, the turn reads as the boat swinging; 1: locked to the hull)
export const VIEW_FN = {
  hero: (u) => ({tx: 0, ty: 0.55, tz: 0.2, az: 300 + 2 * u, el: 20, d: 19, sx: 0, sy: -40, f: 0.55}),
  top: (u) => ({tx: 0, ty: 0, tz: 1.5, az: 180 + 0.6 * u, el: 80, d: 36, sx: 0, sy: -34, f: 0}),
  stern: (u) => ({tx: 0, ty: 0.6, tz: -1, az: 180 + 1.5 * u, el: 14, d: 13, sx: 0, sy: -36, f: 1}),
  rudder: (u) => ({tx: 0, ty: -0.68, tz: -2.85, az: 248 + 2 * u, el: -8, d: 4.4, sx: 0, sy: -24, f: 1}),
  mast: (u) => ({tx: 0, ty: 1.45, tz: 0.15, az: 312 + 3 * u, el: 12, d: 7.2, sx: 0, sy: -36, f: 1}),
};
export const withHeading = (v, hdg) => ({...v, az: v.az - v.f * hdg});
const VIEWS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
const blend = (a, b, k) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 2 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
};
export const camAt = (t, orbit, hdg) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = withHeading(VIEW_FN[VIEWS[i][1]](t - VIEWS[i][0]), hdg);
  let o = cur;
  if (i > 0) {
    const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.6, t);
    if (k < 1) o = blend(withHeading(VIEW_FN[VIEWS[i - 1][1]](t - VIEWS[i - 1][0]), hdg), cur, k);
  }
  if (orbit > 0) o = {...o, az: o.az + 14 * Math.max(0, t - lastFlip('orbit', t)) * orbit};
  return o;
};
export const viewAt = (t) => VIEWS.filter(([a]) => a <= t).pop();

// ------------------------------------------------------------ the operator's pointer
const REST = [[860, 470], [760, 420], [940, 520], [820, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.run) {
      const [scn, build] = e.run.split('-');
      const prev = SCRIPT.filter((x) => x.run && x.t < e.t).pop();
      const [pscn] = prev.run.split('-');
      if (scn !== pscn) out.push({t: e.t - 0.4, spot: ui.spots[scn]});
      out.push({t: e.t, spot: ui.spots[build]});
    }
    if (e.view) out.push({t: e.t + (e.run ? 0.4 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    return out;
  }).sort((a, b) => a.t - b.t);
  const WP = [[0, 900, 600]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot], [e.t + 0.22, ...e.spot]);
    const next = EV[i + 1];
    if (!next || next.t - e.t > 1.8) WP.push([e.t + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the labels: subsystems, each tied to a part of the boat
const V3 = THREE.Vector3;
const PARTS = [
  {name: 'COMPASS / IMU', sub: 'HEADING SOURCE · 10 HZ', at: (v) => [v.compass, new V3(0, 0, 0)]},
  {name: 'AUTOPILOT COMPUTER', sub: (b) => `SOFTWARE UNDER TEST · ${b}`, at: (v) => [v.computer, new V3(0, 0.1, 0)]},
  {name: 'HULL', sub: 'DEEP-V · 7.0 M LOA', at: (v) => [v.hull, new V3(-1.12, 0.3, 1.4)]},
  {name: 'INBOARD ENGINE', sub: 'DRIVES THE SHAFT · PUMPS THE RAM', at: (v) => [v.engine, new V3(0, 0.36, 0)]},
  {name: 'STEERING RAM', sub: 'HYDRAULIC · PUSHES THE TILLER', at: (v) => [v.steer, V.ramAnchor.clone().lerp(v.out.tillerEnd, 0.5)]},
  {name: 'RUDDER', sub: '±35° MECHANICAL STOPS', at: (v) => [v.rudderPivot, new V3(0, -0.72, -0.12)]},
  {name: 'PROPELLER', sub: '3-BLADE · SHAFT DRIVE', at: (v) => [v.drive, new V3(0, V.prop.y, V.prop.z)]},
];
export function makeLabels(st) {
  const w = new V3();
  return (build, o) => {
    if (o < 0.02) return [];
    st.vessel.root.updateMatrixWorld(true);
    const pts = PARTS.map((p) => {
      const [obj, local] = p.at(st.vessel);
      w.copy(local);
      obj.localToWorld(w);
      return {p, at: st.project(w)};
    }).filter((x) => x.at && x.at[0] > 330 && x.at[0] < 1290 && x.at[1] > 130 && x.at[1] < 740);
    const L = pts.filter((x) => x.at[0] < 800).sort((a, b) => a.at[1] - b.at[1]);
    const R = pts.filter((x) => x.at[0] >= 800).sort((a, b) => a.at[1] - b.at[1]);
    const out = [];
    const stack = (col, x, wd) => {
      let y = 160;
      for (const c of col) {
        y = Math.max(y, Math.min(690, c.at[1] - 10));
        const sub = typeof c.p.sub === 'function' ? c.p.sub(build) : c.p.sub;
        out.push({name: c.p.name, sub, at: c.at, label: [x, y], w: wd, o});
        y += 36;
      }
    };
    stack(L, 340, 200);
    stack(R, 1090, 200);
    return out;
  };
}

export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (s) => {
    const r = RUNS[s.runId];
    ui.update({
      run: r,
      sample: s.m,
      phase: phaseAt(r, s.m.tau),
      checks: checksAt(r, s.m.tau),
      view: s.view,
      display: s.display,
      paused: s.paused ?? false,
      speed: s.speed,
      speedK: s.speedK,
      callouts: labels(r.build, s.labels),
      cursor: s.cursor,
    });
  };
}

export const SPEED = [1, 12];
export const speedK = (v) => (v - SPEED[0]) / (SPEED[1] - SPEED[0]);

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createVesselStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    return {
      resize,
      render(t) {
        const {id, tau, rate} = runAt(t);
        const r = RUNS[id];
        const {m, st: bs} = boatState(r, tau, t);
        const disp = displayAt(t);
        const cam = camAt(t, disp.orbit, m.hdg);
        st.frame(
          {...bs, xray: easedDisplay('xray', t), explode: easedDisplay('exploded', t, 0.9), wake: easedDisplay('wake', t), course: easedDisplay('course', t)},
          {...cam, az: cam.az * D2R, el: cam.el * D2R},
        );
        const [vt0, view] = viewAt(t);
        frame({runId: id, m, view, display: disp, speed: rate, speedK: speedK(rate), labels: easedDisplay('labels', t, 0.5) * ss(vt0 + 0.6, vt0 + 1.2, t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
