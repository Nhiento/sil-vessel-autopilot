// The SIL test logs (exported by export_runs.py) and everything read from them. The page does no physics: one input,
// tau (seconds into a test run), poses the boat, the rudder, the ram, the compass light and every panel. Positions on
// the water are integrated once at load from the logged speed and heading.
import DATA from './runs.json';

const D2R = Math.PI / 180;
const KN = 0.514444;

function prep(r) {
  const c = Object.fromEntries(r.cols.map((k, i) => [k, i]));
  const n = r.data.length;
  const dt = r.data[1][c.t] - r.data[0][c.t];
  const col = (k) => Float32Array.from(r.data, (row) => row[c[k]]);
  // unwrap the heading so interpolation never swings the long way past 0/360
  const hdg = col('hdg');
  for (let i = 1; i < n; i++) {
    let d = hdg[i] - hdg[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    hdg[i] = hdg[i - 1] + d;
  }
  const spd = col('spd');
  const px = new Float32Array(n);
  const pz = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const v = spd[i - 1] * KN * dt;
    const a = hdg[i - 1] * D2R;
    px[i] = px[i - 1] - Math.sin(a) * v;
    pz[i] = pz[i - 1] + Math.cos(a) * v;
  }
  return {...r, n, dt, sp: col('sp'), hdg, rud: col('rud'), cmd: col('cmd'), spd, meas: col('meas'), fault: col('fault'), px, pz};
}

export const RUNS = Object.fromEntries(DATA.runs.map((r) => [r.id, prep(r)]));
export const RUN_IDS = Object.keys(RUNS);
export const SCENARIOS = ['S02', 'S05'];
export const BUILDS = ['v1.0', 'v1.1'];

/** Everything at tau seconds into run r, interpolated between log samples (flags hold their last value). */
export function sampleAt(r, tau) {
  const u = Math.min(r.n - 1.0001, Math.max(0, tau / r.dt));
  const i = Math.floor(u);
  const k = u - i;
  const L = (A) => A[i] + (A[i + 1] - A[i]) * k;
  return {
    tau: Math.max(0, Math.min(r.duration, tau)),
    sp: L(r.sp),
    hdg: L(r.hdg),
    rud: L(r.rud),
    cmd: L(r.cmd),
    spd: L(r.spd),
    meas: r.meas[i] > 0.5,
    fault: r.fault[i] > 0.5,
    x: L(r.px),
    z: L(r.pz),
  };
}

/** The boat's track over the last `back` seconds, as [x, z] relative to where it is now. */
export function trail(r, tau, back = 45) {
  const s = sampleAt(r, tau);
  const pts = [];
  const i1 = Math.min(r.n - 1, Math.floor(tau / r.dt));
  const i0 = Math.max(0, Math.floor((tau - back) / r.dt));
  for (let i = i0; i <= i1; i++) pts.push([r.px[i] - s.x, r.pz[i] - s.z, (tau - i * r.dt) / back]);
  pts.push([0, 0, 0]);
  return pts;
}

const within = (iv, t) => iv.some(([a, b]) => t >= a && t < b);
export const saturatedAt = (r, tau) => within(r.saturated, tau);
export const dropoutAt = (r, tau) => within(r.dropouts, tau);

// ------------------------------------------------------------ what the replay says is happening
function events(r) {
  const E = [[0, `HOLDING ${Math.round(r.sp[0])}° AT 10 KN`, 'move']];
  E.push([r.step.t, `COURSE CHANGE TO ${r.step.to}° COMMANDED`, 'move']);
  for (const [a, b] of r.saturated) {
    E.push([a + 0.6, 'RUDDER HARD OVER · AT THE 35° STOP', 'move']);
    if (b < r.duration - 1) E.push([b, 'RUDDER COMING OFF THE STOP', 'move']);
  }
  for (const [a, b] of r.dropouts) {
    E.push([a, r.build === 'v1.0' ? 'COMPASS LOST · STEERING ON STALE DATA' : 'COMPASS LOST · SAFE MODE · MIDSHIPS', r.build === 'v1.0' ? 'fail' : 'ok']);
    E.push([b, 'COMPASS BACK · CONTROL RESUMED', 'move']);
  }
  const bad = r.peak.deg > 2;
  E.push([r.peak.t, bad ? `OVERSHOOT · ${r.peak.deg.toFixed(1)}° PAST THE COURSE` : `ON COURSE · ${r.peak.deg.toFixed(1)}° OVERSHOOT`, bad ? 'fail' : 'ok']);
  if (bad) E.push([r.peak.t + 14, 'INTEGRATOR WOUND UP · CREEPING BACK', 'fail']);
  else E.push([r.peak.t + 10, 'SETTLED · HOLDING THE NEW COURSE', 'ok']);
  return E.sort((a, b) => a[0] - b[0]);
}
const EVENTS = Object.fromEntries(RUN_IDS.map((id) => [id, events(RUNS[id])]));
export const phaseAt = (r, tau) => {
  const e = EVENTS[r.id].filter(([t]) => t <= tau).pop();
  return {text: e[1], kind: e[2]};
};

// ------------------------------------------------------------ live verification: a verdict appears once it is known
const revealAt = (r, c) => {
  const end = r.dropouts[0]?.[1] ?? 0;
  switch (c.id) {
    case 'REQ-HDG-001':
      return r.step.t + (c.passed ? c.value : c.limit);
    case 'REQ-HDG-002':
    case 'REQ-FLT-002':
      return r.peak.t + 4;
    case 'REQ-ACT-001':
      return (r.saturated[r.saturated.length - 1]?.[1] ?? 0) + 1;
    case 'REQ-FLT-001':
      return (r.dropouts[0]?.[0] ?? 0) + (c.passed ? 0.5 : c.limit);
    case 'REQ-FLT-003':
      return end + (c.passed ? c.value : c.limit);
    default:
      return r.duration;
  }
};
export const checksAt = (r, tau) => r.checks.map((c) => ({...c, state: tau >= revealAt(r, c) ? (c.passed ? 'pass' : 'fail') : 'pending'}));
