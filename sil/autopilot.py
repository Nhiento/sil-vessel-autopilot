"""
The software under test: a heading + speed autopilot.

This is the code a real team would ship to the boat. The SIL harness
feeds it simulated sensor readings and checks what it commands.

Two builds exist so the test campaign can show a real
fail -> root cause -> fix -> re-test loop:

  v1.0  Baseline. The heading integrator keeps accumulating while the
        rudder is saturated (integrator windup) and the controller has
        no handling for a missing heading sensor.
  v1.1  Fix. Adds anti-windup (integrator frozen while saturated) and a
        sensor-fault safe mode (rudder to midships, integrator frozen,
        fault flag raised) until the sensor comes back.
"""

from dataclasses import dataclass


def wrap_180(angle_deg: float) -> float:
    """Wrap an angle error into [-180, 180) so the boat turns the short way."""
    return (angle_deg + 180.0) % 360.0 - 180.0


@dataclass
class AutopilotConfig:
    build: str = "v1.1"
    # Heading PID (rudder deg per deg of error)
    kp: float = 4.0
    ki: float = 0.03
    kd: float = 14.0
    rudder_limit_deg: float = 35.0
    # Speed PI (throttle per knot of error)
    sp_kp: float = 0.08
    sp_ki: float = 0.02

    @property
    def anti_windup(self) -> bool:
        return self.build != "v1.0"

    @property
    def fault_handling(self) -> bool:
        return self.build != "v1.0"


class Autopilot:
    def __init__(self, cfg: AutopilotConfig):
        self.cfg = cfg
        self.heading_integral = 0.0
        self.speed_integral = 0.0
        self.last_heading = None
        self.fault_active = False

    def update(self, heading_meas, yaw_rate, speed_meas,
               heading_sp, speed_sp, dt):
        """One control cycle. Returns (rudder_cmd_deg, throttle_cmd, status)."""
        c = self.cfg

        # ---------------- Sensor fault handling ----------------
        if heading_meas is None:
            if c.fault_handling:
                # Safe mode: rudder midships, freeze integrator, raise flag
                self.fault_active = True
                rudder = 0.0
            else:
                # v1.0 bug: silently keeps using the last (stale) reading
                heading_meas = self.last_heading if self.last_heading is not None else 0.0
                rudder = None
        else:
            self.fault_active = False
            rudder = None

        # ---------------- Heading PID ----------------
        if rudder is None:
            err = wrap_180(heading_sp - heading_meas)
            unsat = c.kp * err + c.ki * self.heading_integral - c.kd * yaw_rate
            rudder = max(-c.rudder_limit_deg, min(c.rudder_limit_deg, unsat))

            saturated = abs(unsat) > c.rudder_limit_deg
            if not (c.anti_windup and saturated):
                self.heading_integral += err * dt
            self.last_heading = heading_meas

        # ---------------- Speed PI ----------------
        sp_err = speed_sp - speed_meas
        throttle_unsat = c.sp_kp * sp_err + c.sp_ki * self.speed_integral
        throttle = max(0.0, min(1.0, throttle_unsat))
        if 0.0 < throttle_unsat < 1.0:          # simple anti-windup
            self.speed_integral += sp_err * dt

        status = "FAULT_SAFE_MODE" if self.fault_active else "NORMAL"
        return rudder, throttle, status
