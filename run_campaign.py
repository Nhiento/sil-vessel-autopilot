"""
Run the full SIL test campaign.

For every software build and every scenario:
  1. run the closed-loop simulation
  2. log all signals to SQLite
  3. verify every applicable requirement (pass/fail)
  4. write a traceability matrix, a markdown report, and plots

Usage:
    python run_campaign.py                  # both builds
    python run_campaign.py --builds v1.1    # one build
"""

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from sil.harness import run_scenario
from sil.requirements import REQUIREMENTS
from sil.scenarios import SCENARIOS

RESULTS = Path("results")
PLOTS = RESULTS / "plots"

SCHEMA = """
CREATE TABLE IF NOT EXISTS requirements (
    req_id TEXT PRIMARY KEY, text TEXT, method TEXT,
    threshold REAL, units TEXT);
CREATE TABLE IF NOT EXISTS scenarios (
    scenario_id TEXT PRIMARY KEY, title TEXT, objective TEXT, duration_s REAL);
CREATE TABLE IF NOT EXISTS test_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT, build TEXT, scenario_id TEXT,
    started_utc TEXT);
CREATE TABLE IF NOT EXISTS measurements (
    run_id INTEGER, t REAL, heading_sp REAL, heading_true REAL,
    heading_meas REAL, yaw_rate REAL, rudder_cmd REAL, rudder_actual REAL,
    speed_sp REAL, speed_kn REAL, throttle REAL, status TEXT);
CREATE TABLE IF NOT EXISTS results (
    run_id INTEGER, req_id TEXT, measured REAL, threshold REAL,
    units TEXT, passed INTEGER);
"""


def fmt(v):
    return "never" if v == float("inf") else f"{v:.2f}"


def plot_run(df, sc, build, path):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 5.5), sharex=True)
    ax1.plot(df.t, df.heading_sp, "--", color="#888", label="Commanded heading")
    ax1.plot(df.t, df.heading_true, color="#1f6feb", label="Actual heading")
    for start, end in sc.env.dropouts:
        ax1.axvspan(start, end, color="#d62728", alpha=0.15, label="Compass dropout")
        ax2.axvspan(start, end, color="#d62728", alpha=0.15)
    ax1.set_ylabel("Heading (deg)")
    ax1.legend(loc="lower right", fontsize=8)
    ax1.set_title(f"{sc.id} - {sc.title}  [{build}]")
    ax1.grid(alpha=0.3)

    ax2.plot(df.t, df.rudder_cmd, color="#e8890c", label="Rudder command")
    ax2.axhline(35, color="#999", lw=0.8, ls=":")
    ax2.axhline(-35, color="#999", lw=0.8, ls=":")
    ax2.set_ylabel("Rudder (deg)")
    ax2.set_xlabel("Time (s)")
    ax2.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def plot_before_after(runs, sc_id, path):
    fig, ax = plt.subplots(figsize=(9, 4))
    for build, color in (("v1.0", "#d62728"), ("v1.1", "#2ca02c")):
        if (build, sc_id) in runs:
            df = runs[(build, sc_id)]
            ax.plot(df.t, df.heading_true, color=color, label=f"{build}")
    sc_df = runs.get(("v1.1", sc_id), runs.get(("v1.0", sc_id)))
    ax.plot(sc_df.t, sc_df.heading_sp, "--", color="#888", label="Commanded")
    ax.set_title(f"{sc_id}: before vs. after the fix")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Heading (deg)")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--builds", nargs="+", default=["v1.0", "v1.1"])
    ap.add_argument("--db", default=str(RESULTS / "sil_results.db"))
    args = ap.parse_args()

    PLOTS.mkdir(parents=True, exist_ok=True)
    db_path = Path(args.db)
    if db_path.exists():
        db_path.unlink()                       # fresh campaign each run
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)

    con.executemany("INSERT INTO requirements VALUES (?,?,?,?,?)",
                    [(r.id, r.text, r.method, r.threshold, r.units) for r in REQUIREMENTS])
    con.executemany("INSERT INTO scenarios VALUES (?,?,?,?)",
                    [(s.id, s.title, s.objective, s.duration_s) for s in SCENARIOS])

    rows, runs = [], {}
    for build in args.builds:
        for sc in SCENARIOS:
            df = run_scenario(sc, build)
            runs[(build, sc.id)] = df

            cur = con.execute(
                "INSERT INTO test_runs (build, scenario_id, started_utc) VALUES (?,?,?)",
                (build, sc.id, datetime.now(timezone.utc).isoformat(timespec="seconds")))
            run_id = cur.lastrowid
            df.assign(run_id=run_id).to_sql("measurements", con,
                                            if_exists="append", index=False)

            for r in REQUIREMENTS:
                if sc.id not in r.scenarios:
                    continue
                val, ok = r.metric(df, sc, r.threshold)
                con.execute("INSERT INTO results VALUES (?,?,?,?,?,?)",
                            (run_id, r.id, float(val), r.threshold, r.units, int(ok)))
                rows.append(dict(build=build, req_id=r.id, scenario=sc.id,
                                 measured=val, threshold=r.threshold,
                                 units=r.units, passed=ok))

            plot_run(df, sc, build, PLOTS / f"{build}_{sc.id}.png")
    con.commit()
    con.close()

    res = pd.DataFrame(rows)
    for sc_id in ("S02", "S05"):
        if {"v1.0", "v1.1"} <= set(args.builds):
            plot_before_after(runs, sc_id, PLOTS / f"before_after_{sc_id}.png")

    # ---------------- Console + markdown report ----------------
    lines = ["# SIL Test Campaign Report", "",
             f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}", ""]

    lines += ["## Summary", "", "| Build | Checks | Passed | Failed |", "|---|---|---|---|"]
    for build, g in res.groupby("build"):
        lines.append(f"| {build} | {len(g)} | {g.passed.sum()} | {(~g.passed).sum()} |")

    for build, g in res.groupby("build"):
        matrix = g.pivot_table(index="req_id", columns="scenario", values="passed",
                               aggfunc="first")
        matrix = matrix.map(lambda x: "-" if pd.isna(x) else ("PASS" if x else "FAIL"))
        lines += ["", f"## Traceability matrix - {build}", "",
                  "| Requirement | " + " | ".join(matrix.columns) + " |",
                  "|---|" + "---|" * len(matrix.columns)]
        for req_id, row in matrix.iterrows():
            lines.append(f"| {req_id} | " + " | ".join(row.values) + " |")

    fails = res[~res.passed]
    lines += ["", "## Failures", ""]
    if fails.empty:
        lines.append("None.")
    else:
        lines += ["| Build | Requirement | Scenario | Measured | Limit |", "|---|---|---|---|---|"]
        for _, f in fails.iterrows():
            lines.append(f"| {f.build} | {f.req_id} | {f.scenario} | "
                         f"{fmt(f.measured)} {f.units} | {f.threshold} {f.units} |")

    report = "\n".join(lines) + "\n"
    (RESULTS / "campaign_report.md").write_text(report)
    res.to_csv(RESULTS / "results.csv", index=False)
    print(report)
    print(f"Database: {db_path}   Plots: {PLOTS}/")


if __name__ == "__main__":
    main()
