"""
Simulated vessel ("the plant").

In a SIL test, this replaces the real boat. It models just enough physics
to exercise the control software realistically:

  * Heading dynamics  - first-order Nomoto steering model
                        T * r_dot + r = K * rudder + disturbance
  * Speed dynamics    - thrust vs. quadratic hull drag
                        m * u_dot = throttle * T_max - d * u * |u|
  * Rudder actuator   - position limit (+/-35 deg) and rate limit (deg/s)
  * Environment       - constant current/wind yaw moment
  * Heading sensor    - Gaussian noise and scheduled dropouts (faults)

All angles are degrees, speeds are knots at the interface (m/s internally).
"""

from dataclasses import dataclass, field
import numpy as np

KNOT = 0.514444  # m/s per knot


@dataclass
class VesselParams:
    # Steering (Nomoto first-order model)
    K0: float = 0.12            # steering gain at reference speed [1/s]
    T: float = 6.0              # steering time constant [s]
    u_ref_kn: float = 10.0      # speed the steering gain is referenced to [kn]

    # Rudder actuator
    rudder_limit_deg: float = 35.0
    rudder_rate_deg_s: float = 10.0

    # Propulsion / hull
    mass_kg: float = 2000.0
    thrust_max_n: float = 4000.0
    drag_coeff: float = 67.0    # gives ~15 kn top speed at full throttle


@dataclass
class Environment:
    yaw_disturbance_deg_s2: float = 0.0   # constant current/wind moment
    heading_noise_std_deg: float = 0.0    # heading sensor noise
    dropouts: list = field(default_factory=list)  # [(t_start, t_end), ...]
    seed: int = 0


class Vessel:
    def __init__(self, params: VesselParams, env: Environment,
                 heading0_deg: float = 0.0, speed0_kn: float = 0.0):
        self.p = params
        self.env = env
        self.rng = np.random.default_rng(env.seed)

        self.heading_deg = heading0_deg
        self.yaw_rate_deg_s = 0.0
        self.speed_ms = speed0_kn * KNOT
        self.rudder_deg = 0.0

    # ------------------------------------------------------------------
    def step(self, rudder_cmd_deg: float, throttle_cmd: float, dt: float):
        """Advance the simulation by dt seconds."""
        p = self.p

        # Rudder actuator: rate limit, then position limit
        max_move = p.rudder_rate_deg_s * dt
        delta = np.clip(rudder_cmd_deg - self.rudder_deg, -max_move, max_move)
        self.rudder_deg = float(np.clip(self.rudder_deg + delta,
                                        -p.rudder_limit_deg, p.rudder_limit_deg))

        # Steering gets stronger as the boat goes faster
        speed_kn = self.speed_ms / KNOT
        K = p.K0 * max(speed_kn, 0.5) / p.u_ref_kn

        # Nomoto: T * r_dot + r = K * delta  (+ disturbance)
        r_dot = (K * self.rudder_deg - self.yaw_rate_deg_s) / p.T \
            + self.env.yaw_disturbance_deg_s2
        self.yaw_rate_deg_s += r_dot * dt
        self.heading_deg = (self.heading_deg + self.yaw_rate_deg_s * dt) % 360.0

        # Surge: thrust vs. quadratic drag
        throttle = float(np.clip(throttle_cmd, 0.0, 1.0))
        thrust = throttle * p.thrust_max_n
        drag = p.drag_coeff * self.speed_ms * abs(self.speed_ms)
        self.speed_ms += (thrust - drag) / p.mass_kg * dt

    # ------------------------------------------------------------------
    def read_heading_sensor(self, t: float):
        """Return a noisy heading measurement, or None during a dropout."""
        for start, end in self.env.dropouts:
            if start <= t < end:
                return None
        noise = self.rng.normal(0.0, self.env.heading_noise_std_deg) \
            if self.env.heading_noise_std_deg > 0 else 0.0
        return (self.heading_deg + noise) % 360.0

    def read_yaw_rate_sensor(self):
        return self.yaw_rate_deg_s

    def read_speed_sensor(self):
        return self.speed_ms / KNOT
