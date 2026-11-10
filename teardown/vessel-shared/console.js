// The ASV-7 test console at 1600 x 900: the SIL badge and title, the heading panel (compass rose, commanded vs
// actual, rudder against its stops), system status (what the compass says vs what the software believes), the heading
// trace of the whole run, the test case with its requirement verdicts appearing as they are decided, the run and build
// switches, views, display toggles, the replay timeline and the labels with leaders into the boat.
// update(s) redraws every live part from the frame's state.
export const C = {ink: '#1f2a30', mute: '#86949b', faint: '#cbd7dc', line: '#dbe4e8', panel: 'rgba(250,252,252,.95)', or: '#e3562a', green: '#2fa36b', blue: '#2f6f9f', track: '#e7eef1'};
export const VIEWS = ['hero', 'top', 'stern', 'rudder', 'mast'];
export const VIEW_LABEL = {hero: 'HERO', top: 'TOP', stern: 'STERN', rudder: 'RUDDER', mast: 'MAST'};
export const DISPLAY = ['labels', 'xray', 'exploded', 'wake', 'course', 'orbit'];
export const DISPLAY_LABEL = {labels: 'LABELS', xray: 'X-RAY HULL', exploded: 'EXPLODED', wake: 'WAKE', course: 'COURSE', orbit: 'ORBIT'};
export const SCN_LABEL = {S02: 'S02 TURN 90°', S05: 'S05 DROPOUT'};
const SHORT = {S02: 'HEADING STEP 90°', S05: 'COMPASS DROPOUT MID-TURN'};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(40,70,90,.07)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.8px}
.ph i{display:block;width:3px;height:13px;background:${C.or}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:21px;padding:0 10px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fdfefe;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink};white-space:nowrap}
.pill{position:absolute;height:17px;padding:0 8px;display:flex;align-items:center;border-radius:3px;font:700 8.6px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:#fff}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:6px;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink}}
.call b i{display:block;width:6px;height:6px;background:${C.or}}
.call span{display:block;font:500 7.8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.mute};margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.or};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };
  const chipAt = (x, y) => add(`<div class="pill" style="left:${x}px;top:${y}px"></div>`);
  const setChip = (n, text, col) => {
    n.textContent = text;
    n.style.background = col;
    n.style.left = `${parseFloat(n.dataset.r) - (text.length * 6.6 + 16)}px`;
  };

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:160px;height:89px;background:${C.or}"></div>`);
  add(`<svg style="position:absolute;left:24px;top:28px" width="40" height="32"><path d="M2 20 L38 20 L32 30 L8 30 Z" fill="#fff"/><path d="M19 2 V19 M19 4 L31 16 H19" stroke="#fff" stroke-width="2.6" fill="none" stroke-linejoin="round"/></svg>`);
  add(`<div class="mo" style="position:absolute;left:76px;top:35px;color:#fff;font-size:16px;font-weight:600;letter-spacing:4px">SIL</div>`);
  add(`<div class="sm" style="position:absolute;left:182px;top:22px;letter-spacing:2.4px">AUTONOMOUS SURFACE VESSEL</div>`);
  add(`<div style="position:absolute;left:181px;top:37px;font-size:33px;font-weight:700;letter-spacing:-.6px;line-height:1">ASV-7 Autopilot <span style="color:${C.or};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:182px;top:77px;font-size:11.2px;letter-spacing:2.2px;color:#5d6b72">SOFTWARE-IN-THE-LOOP REPLAY / HEADING CONTROL</div>`);
  add(`<div class="sm" style="position:absolute;left:1046px;top:49px;letter-spacing:2.6px;font-size:9.6px">TEST &amp; VERIFICATION · BUILD</div>`);
  add(`<div class="mo" style="position:absolute;left:1290px;top:47px;color:${C.or};font-size:12px;letter-spacing:-1px">//////</div>`);
  const hdrBuild = add(`<div style="position:absolute;right:${1600 - 1488}px;top:34px;color:${C.or};font-size:39px;font-weight:700;letter-spacing:-.8px;line-height:1"></div>`);
  add(`<div style="position:absolute;left:1500px;top:33px;width:1px;height:44px;background:${C.faint}"></div>`);
  add(`<div class="sm" style="position:absolute;left:1516px;top:34px;line-height:14px;letter-spacing:2.2px">PLAN<br>TEST<br>VERIFY</div>`);
  {
    let h = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) h += `<path d="M${c * 25.5 + 4} ${r * 25.5}v8M${c * 25.5} ${r * 25.5 + 4}h8" stroke="${C.or}" stroke-width="1.1" opacity=".7"/>`;
    add(`<svg style="position:absolute;left:740px;top:80px" width="300" height="64">${h}</svg>`);
  }

  // ------------------------------------------------------------ 01 heading
  panel(28, 126, 282, 262, 'HEADING', '01');
  const rose = add(`<svg style="position:absolute;left:40px;top:156px" width="124" height="124"></svg>`);
  const rows = ['COMMANDED', 'ACTUAL', 'ERROR'].map((n, i) => {
    const y = 166 + i * 36;
    add(`<div class="sm" style="position:absolute;left:178px;top:${y}px">${n}</div>`);
    return add(`<div class="mo" style="position:absolute;left:177px;top:${y + 12}px;font-size:16px;font-weight:600"></div>`);
  });
  add(`<div style="position:absolute;left:42px;top:292px;width:254px;height:1px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:42px;top:304px">RUDDER</div>`);
  const rudVal = add(`<div class="mo" style="position:absolute;right:${1600 - 296}px;top:301px;font-size:11px;font-weight:600"></div>`);
  const rudSvg = add(`<svg style="position:absolute;left:42px;top:322px" width="254" height="56"></svg>`);

  // ------------------------------------------------------------ 02 system status
  panel(28, 402, 282, 134, 'SYSTEM STATUS', '02');
  const statRows = ['COMPASS / IMU', 'AUTOPILOT MODE', 'STEERING'].map((n, i) => {
    const y = 438 + i * 26;
    add(`<div class="sm" style="position:absolute;left:42px;top:${y + 3}px">${n}</div>`);
    const c = chipAt(0, y);
    c.dataset.r = 296;
    return c;
  });
  const mismatch = add(`<div class="mo" style="position:absolute;left:42px;top:516px;font-size:8.6px;font-weight:700;letter-spacing:1.2px;color:${C.or}"></div>`);

  // ------------------------------------------------------------ 03 heading trace
  panel(28, 550, 282, 182, 'HEADING TRACE', '03');
  const trace = add(`<svg style="position:absolute;left:42px;top:584px" width="254" height="136"></svg>`);

  // ------------------------------------------------------------ 04 test case
  panel(1313, 126, 258, 272, 'TEST CASE', '04');
  const tcTitle = add(`<div class="mo" style="position:absolute;left:1327px;top:162px;font-size:10.5px;font-weight:700;letter-spacing:1.4px"></div>`);
  const tcObj = add(`<div class="mo" style="position:absolute;left:1327px;top:180px;width:232px;font-size:9.2px;line-height:1.65;color:#56636a"></div>`);
  add(`<div style="position:absolute;left:1327px;top:222px;width:232px;height:1px;background:${C.line}"></div>`);
  const checkRows = [0, 1, 2, 3].map((i) => {
    const y = 232 + i * 40;
    const id = add(`<div class="mo" style="position:absolute;left:1327px;top:${y}px;font-size:10px;font-weight:700;letter-spacing:1px"></div>`);
    const val = add(`<div class="sm" style="position:absolute;left:1327px;top:${y + 16}px;font-size:8.4px"></div>`);
    const pill = chipAt(0, y);
    pill.dataset.r = 1559;
    return {id, val, pill};
  });

  // ------------------------------------------------------------ 05 test run, 06 views, 07 display
  const btn = {};
  panel(1313, 412, 258, 112, 'TEST RUN', '05');
  add(`<div style="position:absolute;left:1327px;top:449px;width:230px;height:28px;border-radius:5px;background:${C.track}"></div>`);
  btn.S02 = add(`<div class="bt" style="left:1330px;top:452px;width:110px;height:22px;border:none;background:transparent">${SCN_LABEL.S02}</div>`);
  btn.S05 = add(`<div class="bt" style="left:1442px;top:452px;width:112px;height:22px;border:none;background:transparent">${SCN_LABEL.S05}</div>`);
  add(`<div class="sm" style="position:absolute;left:1327px;top:494px">BUILD</div>`);
  add(`<div style="position:absolute;left:1383px;top:485px;width:174px;height:28px;border-radius:5px;background:${C.track}"></div>`);
  btn['v1.0'] = add(`<div class="bt" style="left:1386px;top:488px;width:83px;height:22px;border:none;background:transparent">v1.0</div>`);
  btn['v1.1'] = add(`<div class="bt" style="left:1471px;top:488px;width:83px;height:22px;border:none;background:transparent">v1.1</div>`);
  const btnRow = (keys, labels, x0, y, wmax = 230) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 7.1 + 22);
      if (x + w > x0 + wmax) {
        x = x0;
        yy += 31;
      }
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px;height:23px">${labels[k]}</div>`);
      x += w + 6;
    }
  };
  panel(1313, 538, 258, 107, 'VIEWS', '06');
  btnRow(VIEWS, VIEW_LABEL, 1327, 575);
  panel(1313, 659, 258, 107, 'DISPLAY', '07');
  btnRow(DISPLAY, DISPLAY_LABEL, 1327, 696);

  // ------------------------------------------------------------ 08 replay
  panel(430, 752, 740, 108, 'TEST REPLAY', '08');
  btn.play = add(`<div class="bt" style="left:445px;top:795px;width:44px;height:44px;border-radius:50%;border:none;background:${C.or};color:#fff;font-size:15px"></div>`);
  const opFrom = add(`<div class="sm" style="position:absolute;left:506px;top:791px"></div>`);
  const opPhase = add(`<div class="mo" style="position:absolute;left:586px;width:344px;top:790px;text-align:center;font-size:9.4px;font-weight:700;letter-spacing:.9px;white-space:nowrap"></div>`);
  const opTo = add(`<div class="sm" style="position:absolute;right:${1600 - 1012}px;top:791px"></div>`);
  const TL = {x: 508, w: 504};
  const tlMarks = add(`<svg style="position:absolute;left:${TL.x}px;top:812px;overflow:visible" width="${TL.w}" height="20"></svg>`);
  add(`<div style="position:absolute;left:${TL.x}px;top:820px;width:${TL.w}px;height:3px;background:${C.track};border-radius:2px"></div>`);
  const tlFill = add(`<div style="position:absolute;left:${TL.x}px;top:820px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const tlKnob = add(`<div style="position:absolute;top:814px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const tlTime = add(`<div class="mo" style="position:absolute;left:506px;top:834px;font-size:9.6px;color:${C.mute};letter-spacing:1px"></div>`);
  add(`<div class="sm" style="position:absolute;left:1029px;top:805px">REPLAY SPEED</div>`);
  const SP = {x: 1031, w: 92};
  add(`<div style="position:absolute;left:${SP.x}px;top:823px;width:${SP.w}px;height:3px;background:${C.track};border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:823px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:817px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const spVal = add(`<div class="mo" style="position:absolute;left:1128px;top:818px;font-size:10px;font-weight:700"></div>`);

  // ------------------------------------------------------------ footer and floor notes
  add(`<div class="sm" style="position:absolute;left:27px;top:882px;letter-spacing:2.2px">REPLAY OF LOGGED SIL RUNS &nbsp;·&nbsp; PROCEDURAL MODEL &nbsp;·&nbsp; ONE INPUT: TEST TIME</div>`);
  add(`<div class="sm" style="position:absolute;right:28px;top:882px;letter-spacing:2.2px">PYTHON SIL → SQLITE → 3D <span style="color:${C.or}">//////</span></div>`);
  add(`<div class="sm" style="position:absolute;left:356px;top:700px;line-height:16px;letter-spacing:2px"><span style="color:${C.or}">- - -</span> COMMANDED COURSE<br><span style="color:${C.ink}">———</span> ACTUAL HEADING</div>`);
  add(`<svg style="position:absolute;left:356px;top:162px" width="90" height="80"><path d="M0 80V0h80" fill="none" stroke="${C.or}" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/></svg>`);
  add(`<svg style="position:absolute;left:1206px;top:640px" width="80" height="80"><path d="M80 0v76H0" fill="none" stroke="${C.or}" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/></svg>`);

  // ------------------------------------------------------------ labels, the pointer
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const l = parseFloat(n.style.left);
    const t = parseFloat(n.style.top);
    return [l + parseFloat(n.style.width) / 2, t + parseFloat(n.style.height) / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  // the heading trace is redrawn only when the run changes; the playhead and the drawn part move every frame
  let traceRun = null;
  let traceBase = '';
  let traceMap = null;
  const drawTraceBase = (r) => {
    const W = 254;
    const H = 136;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < r.n; i++) {
      lo = Math.min(lo, r.hdg[i], r.sp[i]);
      hi = Math.max(hi, r.hdg[i], r.sp[i]);
    }
    lo -= 8;
    hi += 10;
    const X = (t) => 26 + (t / r.duration) * (W - 30);
    const Y = (h) => 8 + (1 - (h - lo) / (hi - lo)) * (H - 30);
    traceMap = {X, Y};
    let h = '';
    for (const [a, b] of r.dropouts) h += `<rect x="${X(a)}" y="6" width="${X(b) - X(a)}" height="${H - 26}" fill="${C.or}" opacity=".12"/>`;
    const top = r.sp[r.n - 1];
    h += `<rect x="${X(r.step.t)}" y="${Y(top + 2)}" width="${X(r.duration) - X(r.step.t)}" height="${Y(top - 2) - Y(top + 2)}" fill="${C.green}" opacity=".12"/>`;
    for (const v of [0, 30, 60, 90]) if (v > lo && v < hi) h += `<line x1="24" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}"/><text x="0" y="${Y(v) + 3}" font-size="7.4" fill="${C.mute}" font-family="JetBrains Mono">${v}°</text>`;
    let p = '';
    for (let i = 0; i < r.n; i += 2) p += `${i ? 'L' : 'M'}${X(i * r.dt).toFixed(1)} ${Y(r.sp[i]).toFixed(1)}`;
    h += `<path d="${p}" fill="none" stroke="${C.or}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    for (const s of [0, 30, 60, 90, 120]) if (s <= r.duration) h += `<text x="${X(s)}" y="${H - 6}" text-anchor="${s === 0 ? 'start' : s >= r.duration ? 'end' : 'middle'}" font-size="7.4" fill="${C.mute}" font-family="JetBrains Mono">${s}s</text>`;
    traceBase = h;
  };

  return {
    spots,
    btn,
    root: ui,
    timeline: (k) => [TL.x + k * TL.w, 821],
    speedKnob: (k) => [SP.x + k * SP.w, 824],
    TL,
    SP,
    update(s) {
      const r = s.run;
      const m = s.sample;
      hdrBuild.textContent = r.build;
      // ---- heading
      {
        const R = 56;
        const cx = 62;
        const cy = 62;
        let h = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fbfdfd" stroke="${C.faint}"/>`;
        for (let i = 0; i < 72; i++) {
          const a = (i * 5 * Math.PI) / 180;
          const l = i % 18 === 0 ? 9 : i % 2 === 0 ? 5 : 3;
          h += `<line x1="${cx + Math.sin(a) * R}" y1="${cy - Math.cos(a) * R}" x2="${cx + Math.sin(a) * (R - l)}" y2="${cy - Math.cos(a) * (R - l)}" stroke="${C.ink}" stroke-width="${i % 18 === 0 ? 1.4 : 0.7}" opacity=".7"/>`;
        }
        for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
          const rr = R - 17;
          h += `<text x="${cx + Math.sin((a * Math.PI) / 180) * rr}" y="${cy - Math.cos((a * Math.PI) / 180) * rr + 3}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${C.mute}" font-family="JetBrains Mono">${t}</text>`;
        }
        const needle = (deg, col, dash, w, len) => {
          const a = (deg * Math.PI) / 180;
          return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(a) * len}" y2="${cy - Math.cos(a) * len}" stroke="${col}" stroke-width="${w}" ${dash ? 'stroke-dasharray="4 3"' : ''} stroke-linecap="round"/>`;
        };
        h += needle(m.sp, C.or, true, 2, R - 4);
        h += needle(m.hdg, C.ink, false, 2.6, R - 12);
        h += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${C.ink}"/>`;
        rose.innerHTML = h;
        const err = wrap180(m.hdg - m.sp);
        rows[0].textContent = `${(((m.sp % 360) + 360) % 360).toFixed(1)}°`;
        rows[1].textContent = `${(((m.hdg % 360) + 360) % 360).toFixed(1)}°`;
        rows[2].textContent = `${err >= 0 ? '+' : ''}${err.toFixed(1)}°`;
        rows[0].style.color = C.or;
        rows[2].style.color = Math.abs(err) > 2 ? C.or : C.green;
        // rudder against its stops: -35 port .. +35 starboard, the command as a hollow marker
        const W = 254;
        const X = (d) => 8 + ((d + 40) / 80) * (W - 16);
        let g = `<rect x="${X(-40)}" y="18" width="${X(-35) - X(-40)}" height="10" fill="${C.or}" opacity=".18"/><rect x="${X(35)}" y="18" width="${X(40) - X(35)}" height="10" fill="${C.or}" opacity=".18"/>`;
        g += `<line x1="${X(-40)}" x2="${X(40)}" y1="23" y2="23" stroke="${C.ink}" stroke-width="1"/>`;
        for (const d of [-35, -20, -10, 0, 10, 20, 35]) g += `<line x1="${X(d)}" x2="${X(d)}" y1="${d === 0 || Math.abs(d) === 35 ? 15 : 19}" y2="27" stroke="${C.ink}" stroke-width="${Math.abs(d) === 35 ? 1.4 : 0.8}"/><text x="${X(d)}" y="44" text-anchor="middle" font-size="7.4" fill="${C.mute}" font-family="JetBrains Mono">${d > 0 ? '+' : ''}${d}</text>`;
        g += `<text x="${X(-38)}" y="10" font-size="7.2" fill="${C.mute}" font-family="JetBrains Mono" letter-spacing="1">PORT STOP</text><text x="${X(38)}" y="10" text-anchor="end" font-size="7.2" fill="${C.mute}" font-family="JetBrains Mono" letter-spacing="1">STBD STOP</text>`;
        g += `<path d="M${X(m.cmd) - 5} 12 L${X(m.cmd) + 5} 12 L${X(m.cmd)} 18 Z" fill="none" stroke="${C.or}" stroke-width="1.2"/>`;
        g += `<rect x="${X(m.rud) - 2.5}" y="15" width="5" height="16" rx="1" fill="${C.ink}"/>`;
        rudSvg.innerHTML = g;
        const atStop = Math.abs(m.rud) > 34.8;
        rudVal.textContent = `${m.rud >= 0 ? '+' : ''}${m.rud.toFixed(1)}°${atStop ? '  AT STOP' : ''}`;
        rudVal.style.color = atStop ? C.or : C.ink;
      }
      // ---- system status: what the compass says vs what the software believes
      {
        const lost = !m.meas;
        setChip(statRows[0], lost ? 'NO DATA' : 'DATA OK', lost ? C.or : C.green);
        setChip(statRows[1], m.fault ? 'SAFE MODE' : 'NORMAL', m.fault ? C.or : C.green);
        const stop = Math.abs(m.rud) > 34.8;
        setChip(statRows[2], stop ? 'AT STOP' : 'FREE', stop ? C.or : C.blue);
        mismatch.textContent = lost && !m.fault ? '▲ SENSOR LOST, SOFTWARE STILL "NORMAL"' : lost && m.fault ? 'FAULT DETECTED · RUDDER MIDSHIPS' : '';
        mismatch.style.color = lost && !m.fault ? C.or : C.green;
      }
      // ---- trace
      {
        if (traceRun !== r.id) {
          traceRun = r.id;
          drawTraceBase(r);
        }
        const {X, Y} = traceMap;
        let p = '';
        const iEnd = Math.min(r.n - 1, Math.floor(m.tau / r.dt));
        for (let i = 0; i <= iEnd; i += 2) p += `${i ? 'L' : 'M'}${X(i * r.dt).toFixed(1)} ${Y(r.hdg[i]).toFixed(1)}`;
        p += `L${X(m.tau).toFixed(1)} ${Y(m.hdg).toFixed(1)}`;
        trace.innerHTML = `${traceBase}<path d="${p}" fill="none" stroke="${C.ink}" stroke-width="1.6"/><line x1="${X(m.tau)}" x2="${X(m.tau)}" y1="6" y2="116" stroke="${C.or}" stroke-width="1"/><circle cx="${X(m.tau)}" cy="${Y(m.hdg)}" r="3" fill="${C.ink}"/>`;
      }
      // ---- test case
      tcTitle.textContent = `${r.scenario} · ${SHORT[r.scenario]}`;
      tcObj.textContent = r.objective;
      checkRows.forEach((row, i) => {
        const c = s.checks[i];
        for (const n of [row.id, row.val, row.pill]) n.style.display = c ? 'block' : 'none';
        if (!c) return;
        row.pill.style.display = 'flex';
        row.id.textContent = c.id;
        const v = c.value === null ? 'NEVER' : `${c.value}`;
        row.val.textContent = c.state === 'pending' ? `LIMIT ${c.limit} ${c.units} · MEASURING` : `MEASURED ${v} ${c.value === null ? '' : c.units} · LIMIT ${c.limit} ${c.units}`;
        setChip(row.pill, c.state === 'pending' ? 'PENDING' : c.state === 'pass' ? 'PASS' : 'FAIL', c.state === 'pending' ? C.faint : c.state === 'pass' ? C.green : C.or);
        row.pill.style.color = c.state === 'pending' ? C.mute : '#fff';
      });
      // ---- switches
      const seg = (k, on) => {
        btn[k].style.background = on ? C.or : 'transparent';
        btn[k].style.color = on ? '#fff' : '#73828a';
        btn[k].style.borderRadius = '4px';
      };
      seg('S02', r.scenario === 'S02');
      seg('S05', r.scenario === 'S05');
      seg('v1.0', r.build === 'v1.0');
      seg('v1.1', r.build === 'v1.1');
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.or : '#fdfefe';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.or : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      // ---- replay
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      opFrom.textContent = `T+ ${mmss(m.tau)}`;
      opTo.textContent = `${r.scenario} · ${r.build}`;
      opPhase.textContent = s.phase.text;
      opPhase.style.color = s.phase.kind === 'fail' ? C.or : s.phase.kind === 'ok' ? C.green : C.ink;
      const k = m.tau / r.duration;
      tlFill.style.width = `${(k * TL.w).toFixed(1)}px`;
      tlKnob.style.left = `${(TL.x + k * TL.w).toFixed(1)}px`;
      if (tlMarks.dataset.run !== r.id) {
        tlMarks.dataset.run = r.id;
        const X = (t) => (t / r.duration) * TL.w;
        let h = '';
        for (const [a, b] of r.dropouts) h += `<rect x="${X(a)}" y="5" width="${X(b) - X(a)}" height="13" fill="${C.or}" opacity=".18"/>`;
        h += `<line x1="${X(r.step.t)}" x2="${X(r.step.t)}" y1="3" y2="18" stroke="${C.ink}" stroke-width="1"/>`;
        h += `<path d="M${X(r.peak.t)} 2 l4 5 h-8z" fill="${r.peak.deg > 2 ? C.or : C.green}"/>`;
        tlMarks.innerHTML = h;
      }
      tlTime.textContent = `${mmss(m.tau)} / ${mmss(r.duration)}`;
      spFill.style.width = `${(s.speedK * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + s.speedK * SP.w).toFixed(1)}px`;
      spVal.textContent = `${s.speed.toFixed(0)}×`;
      // ---- labels
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const right = lx > ax;
        const ex = right ? lx - 6 : lx + c.w + 6;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 6).toFixed(1)}" fill="none" stroke="${C.or}" stroke-width=".9" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${C.or}" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 1).toFixed(1)}px;opacity:${c.o.toFixed(2)};${right ? '' : `width:${c.w}px;text-align:right`}"><b style="${right ? '' : 'justify-content:flex-end'}"><i></i>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
