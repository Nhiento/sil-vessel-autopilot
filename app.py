"""
Test reporting dashboard.

    streamlit run app.py

Tab 1 reads the campaign database (run `python run_campaign.py` first).
Tab 2 is an interactive test bench: change gains or inject faults and
re-run the SIL test live against the requirements.
"""

import sqlite3
from dataclasses import replace
from pathlib import Path

import pandas as pd
import streamlit as st

from sil.harness import run_scenario
from sil.requirements import REQUIREMENTS
from sil.scenarios import SCENARIOS, SCENARIO_BY_ID

DB = Path("results/sil_results.db")

st.set_page_config(page_title="Vessel Autopilot SIL", layout="wide")
st.title("Vessel Autopilot - Software-in-the-Loop Test Dashboard")

tab_campaign, tab_bench = st.tabs(["Campaign results", "Interactive test bench"])


def badge(passed):
    return "PASS" if passed else "FAIL"


# --------------------------------------------------------------------------
with tab_campaign:
    if not DB.exists():
        st.warning("No campaign database yet. Run `python run_campaign.py` first.")
    else:
        con = sqlite3.connect(DB)
        results = pd.read_sql("""
            SELECT tr.build, tr.scenario_id, r.req_id, r.measured, r.threshold,
                   r.units, r.passed, q.text
            FROM results r
            JOIN test_runs tr ON tr.run_id = r.run_id
            JOIN requirements q ON q.req_id = r.req_id
        """, con)

        builds = sorted(results.build.unique())
        build = st.selectbox("Software build", builds, index=len(builds) - 1)
        b = results[results.build == build]

        c1, c2, c3 = st.columns(3)
        c1.metric("Checks run", len(b))
        c2.metric("Passed", int(b.passed.sum()))
        c3.metric("Failed", int((b.passed == 0).sum()))

        st.subheader("Requirements traceability matrix")
        matrix = b.pivot_table(index="req_id", columns="scenario_id",
                               values="passed", aggfunc="first")
        st.dataframe(matrix.map(lambda x: "" if pd.isna(x) else badge(x)),
                     width="stretch")

        fails = b[b.passed == 0]
        if not fails.empty:
            st.subheader("Failures")
            st.dataframe(fails[["req_id", "scenario_id", "measured",
                                "threshold", "units", "text"]],
                         width="stretch", hide_index=True)

        st.subheader("Signal traces")
        sid = st.selectbox("Scenario", [s.id for s in SCENARIOS],
                           format_func=lambda s: f"{s} - {SCENARIO_BY_ID[s].title}")
        run_id = pd.read_sql("SELECT run_id FROM test_runs WHERE build=? AND scenario_id=?",
                             con, params=(build, sid)).run_id.iloc[0]
        m = pd.read_sql("SELECT * FROM measurements WHERE run_id=?", con,
                        params=(int(run_id),)).set_index("t")
        st.line_chart(m[["heading_sp", "heading_true"]], y_label="Heading (deg)")
        st.line_chart(m[["rudder_cmd"]], y_label="Rudder (deg)")
        con.close()

# --------------------------------------------------------------------------
with tab_bench:
    st.write("Tune the autopilot or inject faults, then re-run the test.")
    left, right = st.columns([1, 2])
    with left:
        sid = st.selectbox("Scenario ", [s.id for s in SCENARIOS], index=1,
                           format_func=lambda s: f"{s} - {SCENARIO_BY_ID[s].title}")
        build = st.radio("Build", ["v1.0", "v1.1"], index=1, horizontal=True)
        kp = st.slider("Kp", 0.5, 8.0, 4.0, 0.5)
        ki = st.slider("Ki", 0.0, 0.2, 0.03, 0.01)
        kd = st.slider("Kd", 0.0, 30.0, 14.0, 1.0)
        noise = st.slider("Compass noise (deg, 1-sigma)", 0.0, 3.0, 0.0, 0.25)
        dropout = st.slider("Compass dropout length (s)", 0, 20, 0)

    sc = SCENARIO_BY_ID[sid]
    env = replace(sc.env, heading_noise_std_deg=noise or sc.env.heading_noise_std_deg,
                  dropouts=[(10.0, 10.0 + dropout)] if dropout else sc.env.dropouts)
    sc_run = replace(sc, env=env)
    df = run_scenario(sc_run, build, kp=kp, ki=ki, kd=kd)

    with right:
        rows = []
        for r in REQUIREMENTS:
            if sid not in r.scenarios:
                continue
            if r.id.startswith("REQ-FLT") and not env.dropouts:
                continue
            val, ok = r.metric(df, sc_run, r.threshold)
            rows.append(dict(Requirement=r.id, Result=badge(ok),
                             Measured=f"{val:.2f}" if val != float("inf") else "never",
                             Limit=f"{r.threshold} {r.units}"))
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        t = df.set_index("t")
        st.line_chart(t[["heading_sp", "heading_true"]], y_label="Heading (deg)")
        st.line_chart(t[["rudder_cmd"]], y_label="Rudder (deg)")
