# FRACAS Log (Failure Reporting, Analysis, and Corrective Action)

Failures found during the SIL campaign on build **v1.0**, traced to root cause, fixed in **v1.1**, and verified closed by re-test.

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

### Suggested next items (open)

- Add a sensor *plausibility* check (stuck or jumping values, not just missing ones).
- Add requirement + scenario for rudder actuator failure (stuck rudder).
- Add speed-dependent gain scheduling and verify across 4–15 kn.
