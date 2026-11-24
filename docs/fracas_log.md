# FRACAS Log (Failure Reporting, Analysis, and Corrective Action)

This log documents failures identified during ASV-7
software-in-the-loop testing, including root cause
analysis, corrective actions, verification evidence,
and closure status across autopilot software builds.

---

## FR-001 — Overshoot and slow settling on large course changes

| Field | Detail |
|---|---|
| Build | v1.0 |
| Scenario | S02 — Heading step 90° (rudder saturation) |
| Requirements violated | REQ-HDG-002 (overshoot 14.2% vs. 10% limit), REQ-HDG-001 (did not settle within 2° inside the 120 s test) |
| Symptom | Vessel swings ~13° past the commanded heading, then drifts back very slowly. Still ~7–9° off course at the end of the run. |
| Analysis | Rudder sat at the ±35° limit for ~27 s during the turn. Inspection of the controller shows the integral term kept accumulating the full heading error during saturation. Once the boat reached the target, the large stored integral kept pushing the rudder the same way. |
| Root cause | **Integrator windup**: no anti-windup protection when the actuator is saturated. |
| Corrective action | v1.1 freezes the integrator whenever the unsaturated command exceeds the rudder limit (conditional integration). |
| Verification | Re-ran S01–S06 on v1.1: overshoot 1.3%, settling 31.7 s. REQ-HDG-001/002 **PASS**. No regressions in other requirements. |
| Status | **Closed** |

---

## FR-002 — Compass dropout not detected; slow recovery

| Field | Detail |
|---|---|
| Build | v1.0 |
| Scenario | S05 — 6 s heading sensor dropout mid-turn |
| Requirements violated | REQ-FLT-001 (fault never flagged), REQ-FLT-003 (did not return within 2° inside 45 s of sensor recovery) |
| Symptom | No fault status raised. Rudder stayed hard over through the dropout, and the vessel overshot ~7° and was still ~4° off course at end of test. |
| Analysis | During the dropout, the controller silently reused the last valid (stale) heading. It believed the boat was still far from the target, held full rudder, and accumulated integral error, compounding FR-001. |
| Root cause | **No sensor-validity handling**: missing data treated as valid data. |
| Corrective action | v1.1 detects a missing heading, raises `FAULT_SAFE_MODE`, centers the rudder, and freezes the integrator until valid data returns. |
| Verification | v1.1: fault flagged in 0.0 s (same control cycle), peak deviation 1.0°, recovered within 19.1 s. REQ-FLT-001/002/003 **PASS**. |
| Status | **Closed** |

---

## FR-003 — Stuck-rudder actuator failure not detected

| Field | Detail |
|---|---|
| Date identified | November 23, 2026 |
| Build | v1.1 |
| Scenario | S07 — Stuck rudder during heading maneuver |
| Requirement violated | REQ-FLT-004 — Detection within 2 seconds |
| Measured detection latency | inf (fault never detected) |
| Expected result | Fault detected by simulation time 22.0 s |
| Actual result | No stuck-rudder fault flag raised |
| Symptom | Commanded rudder changes to -35° while actual rudder remains frozen at +35° throughout the fault interval. |
| Analysis | The controller continues issuing corrective steering commands without recognizing that the physical actuator cannot respond. |
| Root cause | Missing actuator-position feedback in the controller interface and absence of dedicated stuck-rudder detection logic. |
| System impact | Loss of effective steering control and significant heading deviation during the actuator failure. |
| Proposed corrective action | Introduce rudder-position feedback, monitor expected versus observed actuator movement, and raise FAULT_STUCK_RUDDER when persistent nonresponse is detected. |
| Target build | v1.2 |
| Verification | Pending implementation and re-test of S07, followed by regression testing of S01–S06. |
| Status | **OPEN** |

### Test configuration

- Initial heading: 0°
- Initial speed: 10 knots
- Heading command at 5 s: 90°
- Heading command at 20 s: 0°
- Physical fault interval: 20–40 s
- Simulation duration: 120 s
- Control loop frequency: 10 Hz

### Supporting evidence

| Metric | Measured value |
|---|---|
| Maximum absolute commanded rudder | 35.000° |
| Frozen actual rudder position | +35.000° |
| Maximum rudder tracking error | 70.000° |
| Peak absolute heading error | 131.195° |
| Peak absolute yaw rate | 4.179°/s |
| Fault detection latency | inf |
| REQ-ACT-001 | PASS |
| REQ-FLT-004 | FAIL |

### Root cause investigation

The existing autopilot receives heading, yaw rate,
and speed measurements but does not receive actual
rudder-position feedback.

Although the simulation records actual rudder position,
this information is not supplied to the controller.

The controller therefore has no dedicated mechanism
to verify whether the steering actuator responds
to its commands.

### Proposed corrective action

1. Extend the controller interface to accept actual
   rudder-position feedback.
2. Monitor commanded and observed actuator movement.
3. Account for normal actuator movement-rate limitations.
4. Detect persistent actuator nonresponse.
5. Raise a dedicated FAULT_STUCK_RUDDER status.
6. Preserve the behavior of previous software builds.
7. Verify detection latency against REQ-FLT-004.
8. Check for false alarms during normal steering.
9. Re-run all baseline scenarios.

### Verification closure criteria

- S07 fault detection latency must not exceed 2.0 s.
- REQ-ACT-001 must continue to pass.
- All 17 baseline verification checks must remain
  successful in v1.2.
- No false stuck-rudder alarms in baseline scenarios.

### Limitations

Detecting a stuck actuator does not physically repair it.

A real vessel would require additional fault mitigation,
redundancy, or emergency operating procedures.

The current corrective action focuses on fault detection
within the simulated operating conditions.

**Corrective action status: OPEN**


### Suggested next items (open)

- Add a sensor *plausibility* check (stuck or jumping values, not just missing ones).
- Add requirement + scenario for rudder actuator failure (stuck rudder).
- Add speed-dependent gain scheduling and verify across 4–15 kn.
