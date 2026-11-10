"""
SIL harness: closes the loop between the software under test (autopilot)
and the simulated vessel, at a fixed control rate, and logs every signal.

    sensors  ->  autopilot.update()  ->  commands  ->  vessel.step()
       ^                                                    |
       +----------------------------------------------------+
"""

import pandas as pd

from .vessel import Vessel, VesselParams
from .autopilot import Autopilot, AutopilotConfig

DT = 0.1  # 10 Hz control loop


def run_scenario(scenario, build="v1.1", dt=DT, **gain_overrides):
    """Run one scenario closed-loop. `gain_overrides` lets you tune
    autopilot gains, e.g. run_scenario(sc, kp=3.0)."""
    vessel = Vessel(VesselParams(), scenario.env,
                    heading0_deg=scenario.heading0_deg,
                    speed0_kn=scenario.speed0_kn)
    ap = Autopilot(AutopilotConfig(build=build, **gain_overrides))

    rows = []
    steps = int(round(scenario.duration_s / dt))
    for i in range(steps + 1):
        t = round(i * dt, 3)
        hdg_sp = scenario.heading_sp(t)
        spd_sp = scenario.speed_sp(t)

        hdg_meas = vessel.read_heading_sensor(t)
        rudder_cmd, throttle_cmd, status = ap.update(
            hdg_meas, vessel.read_yaw_rate_sensor(), vessel.read_speed_sensor(),
            hdg_sp, spd_sp, dt)

        rows.append(dict(
            t=t,
            heading_sp=hdg_sp,
            heading_true=vessel.heading_deg,
            heading_meas=hdg_meas,
            yaw_rate=vessel.yaw_rate_deg_s,
            rudder_cmd=rudder_cmd,
            rudder_actual=vessel.rudder_deg,
            speed_sp=spd_sp,
            speed_kn=vessel.read_speed_sensor(),
            throttle=throttle_cmd,
            status=status,
        ))
        vessel.step(rudder_cmd, throttle_cmd, dt)

    return pd.DataFrame(rows)
