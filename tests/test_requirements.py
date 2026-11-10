"""
Automated verification suite (run with: pytest -v).

Every (requirement, scenario) pair becomes its own test case, so a
failure points straight at the requirement ID that broke. Run this on
every code change to catch regressions before software reaches the boat.
"""

import pytest

from sil.autopilot import wrap_180
from sil.harness import run_scenario
from sil.requirements import REQUIREMENTS
from sil.scenarios import SCENARIO_BY_ID

RELEASE_BUILD = "v1.1"

CASES = [(r, sid) for r in REQUIREMENTS for sid in r.scenarios]


@pytest.mark.parametrize("req, scenario_id", CASES,
                         ids=[f"{r.id}-{s}" for r, s in CASES])
def test_release_build_meets_requirement(req, scenario_id):
    sc = SCENARIO_BY_ID[scenario_id]
    df = run_scenario(sc, RELEASE_BUILD)
    value, passed = req.metric(df, sc, req.threshold)
    assert passed, (f"{req.id} failed on {scenario_id}: measured {value:.2f} "
                    f"{req.units}, limit {req.threshold} {req.units}\n  {req.text}")


# The test suite must be able to catch the known v1.0 defects.
# If these ever start passing on v1.0, the tests have lost their teeth.
KNOWN_V10_DEFECTS = [("REQ-HDG-002", "S02"), ("REQ-FLT-001", "S05")]


@pytest.mark.parametrize("req_id, scenario_id", KNOWN_V10_DEFECTS)
def test_suite_detects_known_defects(req_id, scenario_id):
    req = next(r for r in REQUIREMENTS if r.id == req_id)
    sc = SCENARIO_BY_ID[scenario_id]
    _, passed = req.metric(run_scenario(sc, "v1.0"), sc, req.threshold)
    assert not passed, f"{req_id} should FAIL on v1.0 but passed"


# ---- Unit tests for supporting logic ----
@pytest.mark.parametrize("raw, expected", [
    (0, 0), (190, -170), (-190, 170), (359, -1), (180, -180)])
def test_wrap_180(raw, expected):
    assert wrap_180(raw) == pytest.approx(expected)
