"""
System requirements and their automated verification.

Each requirement has an ID, a "shall" statement, a verification method,
the scenarios that verify it, and a metric function that returns
(measured_value, passed). This is what a requirements tool like Jama
would hold, plus the code that closes each one out.
"""

from dataclasses import dataclass
from typing import Callable
import numpy as np

from .autopilot import wrap_180


def heading_error(df):
    """Signed error between TRUE heading and setpoint (ground truth from the sim)."""
    return np.array([wrap_180(a - b) for a, b in zip(df.heading_true, df.heading_sp)])


@dataclass
class Requirement:
    id: str
    text: str
    method: str          # Test / Analysis / Inspection / Demonstration
    threshold: float
    units: str
    scenarios: list
    metric: Callable     # (df, scenario, threshold) -> (value, passed)


# ---------------------------------------------------------------------------
# Metric functions
# ---------------------------------------------------------------------------
def settling_time(df, sc, thr, band=2.0):
    """Time after the step until |error| stays within `band` deg for good."""
    err = np.abs(heading_error(df))
    after = df.t >= sc.step_time_s
    outside = np.where(after & (err > band))[0]
    if len(outside) == 0:
        val = 0.0
    elif outside[-1] == len(df) - 1:
        val = float("inf")                      # never settled
    else:
        val = df.t.iloc[outside[-1] + 1] - sc.step_time_s
    return val, val <= thr


def overshoot_beyond_target(df, sc):
    """Degrees the boat travels PAST the target, in the direction of the turn."""
    err = heading_error(df)[df.t >= sc.step_time_s]   # true - setpoint
    direction = np.sign(sc.step_size_deg)
    return max(0.0, float((direction * err).max()))


def overshoot_pct(df, sc, thr):
    """Peak travel beyond the target as a % of the step size."""
    val = 100.0 * overshoot_beyond_target(df, sc) / abs(sc.step_size_deg)
    return val, val <= thr


def steady_state_error(df, sc, thr, window_s=30.0):
    """Mean absolute error over the final window."""
    err = np.abs(heading_error(df))[df.t >= df.t.iloc[-1] - window_s]
    val = float(err.mean())
    return val, val <= thr


def rms_error_steady(df, sc, thr, start_s=20.0):
    err = heading_error(df)[df.t >= start_s]
    val = float(np.sqrt(np.mean(err ** 2)))
    return val, val <= thr


def max_rudder_cmd(df, sc, thr):
    val = float(np.abs(df.rudder_cmd).max())
    return val, val <= thr


def fault_detect_latency(df, sc, thr):
    """Seconds between compass loss and the FAULT flag being raised."""
    loss_t = sc.env.dropouts[0][0]
    flagged = df[(df.t >= loss_t) & (df.status == "FAULT_SAFE_MODE")]
    val = float("inf") if flagged.empty else flagged.t.iloc[0] - loss_t
    return val, val <= thr


def peak_deviation_after_fault(df, sc, thr):
    """Worst heading excursion beyond the commanded course (deg)."""
    val = overshoot_beyond_target(df, sc)
    return val, val <= thr


def recovery_time(df, sc, thr, band=2.0):
    """Seconds after the compass returns until heading is back within band and stays."""
    restore_t = sc.env.dropouts[0][1]
    err = np.abs(heading_error(df))
    after = df.t >= restore_t
    outside = np.where(after & (err > band))[0]
    if len(outside) == 0:
        val = 0.0
    elif outside[-1] == len(df) - 1:
        val = float("inf")
    else:
        val = df.t.iloc[outside[-1] + 1] - restore_t
    return val, val <= thr


def speed_rise_time(df, sc, thr, band=0.5):
    target = sc.speed_cmds[-1][1]
    reached = df[np.abs(df.speed_kn - target) <= band]
    val = float("inf") if reached.empty else float(reached.t.iloc[0])
    return val, val <= thr


def speed_overshoot_pct(df, sc, thr):
    target = sc.speed_cmds[-1][1]
    val = max(0.0, 100.0 * (df.speed_kn.max() - target) / target)
    return val, val <= thr


# ---------------------------------------------------------------------------
# Requirement register
# ---------------------------------------------------------------------------
ALL_IDS = ["S01", "S02", "S03", "S04", "S05", "S06"]

REQUIREMENTS = [
    Requirement("REQ-HDG-001",
                "The autopilot shall settle within 2 deg of a commanded heading "
                "change within 45 s.",
                "Test", 45.0, "s", ["S01", "S02"], settling_time),
    Requirement("REQ-HDG-002",
                "Heading overshoot shall not exceed 10% of the commanded change.",
                "Test", 10.0, "%", ["S01", "S02"], overshoot_pct),
    Requirement("REQ-HDG-003",
                "Under a constant yaw disturbance, mean steady-state heading "
                "error shall not exceed 1.0 deg.",
                "Test", 1.0, "deg", ["S03"], steady_state_error),
    Requirement("REQ-HDG-004",
                "With 0.5 deg (1-sigma) compass noise, RMS heading error shall "
                "not exceed 1.5 deg.",
                "Test", 1.5, "deg", ["S04"], rms_error_steady),
    Requirement("REQ-ACT-001",
                "Rudder commands shall never exceed the +/-35 deg mechanical limit.",
                "Test", 35.0, "deg", ALL_IDS, max_rudder_cmd),
    Requirement("REQ-FLT-001",
                "Loss of the heading sensor shall be flagged within 0.5 s.",
                "Test", 0.5, "s", ["S05"], fault_detect_latency),
    Requirement("REQ-FLT-002",
                "During and after a heading sensor loss, the vessel shall not "
                "deviate more than 15 deg past the commanded course.",
                "Test", 15.0, "deg", ["S05"], peak_deviation_after_fault),
    Requirement("REQ-FLT-003",
                "After the heading sensor returns, heading shall be back within "
                "2 deg of the setpoint within 45 s.",
                "Test", 45.0, "s", ["S05"], recovery_time),
    Requirement("REQ-SPD-001",
                "From rest, speed shall reach within 0.5 kn of a 10 kn command "
                "within 60 s.",
                "Test", 60.0, "s", ["S06"], speed_rise_time),
    Requirement("REQ-SPD-002",
                "Speed overshoot shall not exceed 5%.",
                "Test", 5.0, "%", ["S06"], speed_overshoot_pct),
]
