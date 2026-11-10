"""
Export SIL test runs for the 3D teardown viewer.

The 3D page does no physics of its own: it replays these logs, so every
rudder angle, heading and fault light on screen is the real test data.

    python teardown/export_runs.py      (from the project root)
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sil.harness import run_scenario                # noqa: E402
from sil.requirements import REQUIREMENTS, overshoot_beyond_target  # noqa: E402
from sil.scenarios import SCENARIO_BY_ID            # noqa: E402

RUNS = [("S02", "v1.0"), ("S02", "v1.1"), ("S05", "v1.0"), ("S05", "v1.1")]
HZ = 5  # samples per second kept for the viewer
OUT = Path(__file__).parent / "vessel-shared" / "runs.json"


def intervals(mask, t):
    """[(start, end), ...] where mask is True."""
    out, start = [], None
    for on, ti in zip(mask, t):
        if on and start is None:
            start = ti
        elif not on and start is not None:
            out.append([round(start, 2), round(ti, 2)])
            start = None
    if start is not None:
        out.append([round(start, 2), round(float(t[-1]), 2)])
    return out


def export_run(sid, build):
    sc = SCENARIO_BY_ID[sid]
    df = run_scenario(sc, build)
    step = int(round(10 / HZ))                      # harness runs at 10 Hz
    d = df.iloc[::step].reset_index(drop=True)

    checks = []
    for r in REQUIREMENTS:
        if sid not in r.scenarios:
            continue
        val, ok = r.metric(df, sc, r.threshold)
        checks.append(dict(id=r.id, text=r.text, units=r.units, limit=r.threshold,
                           value=None if val == float("inf") else round(float(val), 2),
                           passed=bool(ok)))

    # overshoot peak: when and how far past the target
    err = np.array([(a - b + 180) % 360 - 180 for a, b in zip(df.heading_true, df.heading_sp)])
    direction = np.sign(sc.step_size_deg)
    past = direction * err
    i_peak = int(np.argmax(np.where(df.t >= sc.step_time_s, past, -1e9)))

    return dict(
        id=f"{sid}-{build}", scenario=sid, build=build, title=sc.title,
        objective=sc.objective, duration=sc.duration_s,
        step={"t": sc.step_time_s, "to": sc.step_size_deg},
        dropouts=[list(x) for x in sc.env.dropouts],
        saturated=intervals((df.rudder_cmd.abs() >= 34.99).tolist(), df.t.tolist()),
        fault=intervals((df.status == "FAULT_SAFE_MODE").tolist(), df.t.tolist()),
        peak={"t": round(float(df.t[i_peak]), 2),
              "deg": round(overshoot_beyond_target(df, sc), 2)},
        checks=checks,
        # columns: t, heading setpoint, true heading, rudder (actual),
        # rudder command, speed (kn), compass data valid (1/0), fault flag (1/0)
        cols=["t", "sp", "hdg", "rud", "cmd", "spd", "meas", "fault"],
        data=[[round(float(r.t), 2), round(float(r.heading_sp), 2),
               round(float(r.heading_true), 2), round(float(r.rudder_actual), 2),
               round(float(r.rudder_cmd), 2), round(float(r.speed_kn), 2),
               0 if r.heading_meas is None or r.heading_meas != r.heading_meas else 1,
               1 if r.status == "FAULT_SAFE_MODE" else 0]
              for r in d.itertuples()],
    )


if __name__ == "__main__":
    runs = [export_run(sid, b) for sid, b in RUNS]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"runs": runs}, separators=(",", ":")))
    for r in runs:
        fails = [c["id"] for c in r["checks"] if not c["passed"]]
        print(f"{r['id']:10s} {len(r['data'])} samples  peak {r['peak']['deg']:5.1f} deg  "
              f"fails: {', '.join(fails) or 'none'}")
    print(f"-> {OUT}  ({OUT.stat().st_size / 1024:.0f} KB)")
