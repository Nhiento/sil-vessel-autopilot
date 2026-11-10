"""
Test scenarios (the test matrix).

Each scenario defines initial conditions, setpoint commands, and
environment/fault injections. Together they cover nominal operation,
large maneuvers, disturbances, noisy sensors, and sensor failure.
"""

from dataclasses import dataclass, field
from .vessel import Environment


@dataclass
class Scenario:
    id: str
    title: str
    objective: str
    duration_s: float
    heading0_deg: float = 0.0
    speed0_kn: float = 10.0
    # list of (time_s, heading_setpoint_deg)
    heading_cmds: list = field(default_factory=lambda: [(0.0, 0.0)])
    # list of (time_s, speed_setpoint_kn)
    speed_cmds: list = field(default_factory=lambda: [(0.0, 10.0)])
    env: Environment = field(default_factory=Environment)
    step_time_s: float = None     # when the main heading step happens
    step_size_deg: float = None

    def heading_sp(self, t):
        sp = self.heading_cmds[0][1]
        for t_cmd, val in self.heading_cmds:
            if t >= t_cmd:
                sp = val
        return sp

    def speed_sp(self, t):
        sp = self.speed_cmds[0][1]
        for t_cmd, val in self.speed_cmds:
            if t >= t_cmd:
                sp = val
        return sp


SCENARIOS = [
    Scenario(
        id="S01", title="Heading step 30 deg (nominal)",
        objective="Verify transient response for a routine course change",
        duration_s=90, heading_cmds=[(0, 0), (5, 30)],
        step_time_s=5, step_size_deg=30,
    ),
    Scenario(
        id="S02", title="Heading step 90 deg (rudder saturation)",
        objective="Verify response when the rudder hits its +/-35 deg limit",
        duration_s=120, heading_cmds=[(0, 0), (5, 90)],
        step_time_s=5, step_size_deg=90,
    ),
    Scenario(
        id="S03", title="Heading hold under constant current",
        objective="Verify the autopilot rejects a steady yaw disturbance",
        duration_s=150, heading0_deg=0, heading_cmds=[(0, 0)],
        env=Environment(yaw_disturbance_deg_s2=0.05),
    ),
    Scenario(
        id="S04", title="Heading hold with noisy compass",
        objective="Verify tracking accuracy with 0.5 deg sensor noise",
        duration_s=120, heading0_deg=45, heading_cmds=[(0, 45)],
        env=Environment(heading_noise_std_deg=0.5, seed=42),
    ),
    Scenario(
        id="S05", title="Heading sensor dropout mid-turn",
        objective="Verify fault detection, safe mode, and recovery after a 6 s compass loss",
        duration_s=120, heading_cmds=[(0, 0), (5, 60)],
        env=Environment(dropouts=[(10.0, 16.0)]),
        step_time_s=5, step_size_deg=60,
    ),
    Scenario(
        id="S06", title="Speed step 0 -> 10 kn",
        objective="Verify speed control from rest",
        duration_s=120, speed0_kn=0.0, speed_cmds=[(0, 10.0)],
    ),
]

SCENARIO_BY_ID = {s.id: s for s in SCENARIOS}
