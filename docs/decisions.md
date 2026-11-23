# Decision log

## Why is there a pytest.ini?
Plain `pytest` couldn't import the `sil` package. pytest.ini adds the project
folder to Python's path so tests run with one command.

## Why doesn't the boat's length appear in the physics model?
The steering constants (K, T) were chosen to give realistic small-boat
behavior, not derived from length. That's enough for testing the autopilot
logic, which is the project's goal. Limitation: exact timings won't match a
real 7 m boat. Planned fix: scale published non-dimensional values by length
and speed (Week 3).

## Why does the control loop run at 10 Hz?
The autopilot runs 10 times per second. A small boat's heading changes over
seconds, not milliseconds, so 10 Hz is fast enough to steer smoothly, and it
matches typical marine compass update rates. Trade-off: a slower rate could
make control sluggish; a much faster one adds computing load with little benefit.

## Why is the rudder limited to ±35° and 10°/s?
These match typical steering gear: rudders usually stop around 35°, and
hydraulic steering moves at a limited speed. Modeling the limits is essential,
because the windup bug only appears when the rudder hits its stop.
Without limits, the bug would be invisible.

## Why are the requirement limits 45 s settling and 10% overshoot?
They're reasonable engineering targets I chose for a small boat, not taken
from an official spec. A real project would get them from the customer or
system requirements. What matters here is that each limit is measurable and
checked automatically.

## Why grade the boat on TRUE heading instead of the compass reading?
The question is whether the boat actually went where it should, not what the
sensor believed. The simulator knows the true heading even when the compass
is noisy or missing. This is called ground truth, and it's a big advantage
of simulation over real-world testing.

## Why store results in SQLite instead of CSV files?
SQLite is a real database in a single file, with no server to set up. It
lets me join test runs, results, and requirements with SQL, which CSV files
can't do. Trade-off: for a large team or huge data, a server database like
PostgreSQL would be better.

## Why keep the buggy v1.0 build instead of just fixing the code?
Keeping both builds lets the test suite prove it catches real defects, and
lets me show the full cycle: test fails, root cause found, fix verified.
pytest also checks that v1.0 still FAILS, so the tests can't silently
stop catching those bugs.


## Additional Engineering Decisions and Test Findings

### 1. Why test six different scenarios instead of only normal heading changes?

Each scenario evaluates a different aspect of system performance:

- S01: Normal heading control
- S02: Rudder saturation during large maneuvers
- S03: Environmental disturbance rejection
- S04: Robustness to sensor noise
- S05: Sensor failure detection and recovery
- S06: Speed control

Testing different operating conditions provides broader
verification coverage and helps identify failures that
would not appear during normal operation.

### 2. Why does the rudder remain at a nonzero angle in S03?

The vessel experiences a continuous environmental yaw
disturbance that attempts to rotate it away from its
target heading.

The autopilot maintains a corrective rudder angle of
approximately -2.5 degrees to oppose this disturbance.

Returning the rudder to zero would allow the disturbance
to rotate the vessel away from its target again.

The simulation achieved a mean heading error of 0.233
degrees, satisfying the 1-degree requirement.

### 3. Why does S04 use a fixed random seed?

A fixed random seed ensures that the same sequence of
compass noise is generated when the simulation is repeated.

This makes testing reproducible and allows different
software builds to be compared under identical noise
conditions.

However, testing with one seed does not prove robustness
against every possible noise sequence. Additional seeds
could improve test coverage.

### 4. Why validate the requirements grader using synthetic data?

A faulty grader could incorrectly classify a failed
requirement as PASS.

To validate the overshoot grader, I created a synthetic
dataset with a target heading of 30 degrees and a maximum
heading of 33.6 degrees.

The expected overshoot was exactly 12%, exceeding the
10% acceptance limit.

The grader correctly calculated 12% and returned FAIL,
confirming its behavior for this known failing test case.

### 5. Why analyze raw telemetry in SQL instead of only
looking at PASS/FAIL results?

PASS/FAIL results indicate whether a requirement was
satisfied, but they do not fully explain system behavior.

Using SQL, I analyzed failures, compared software builds,
and calculated how long the rudder remained saturated.

The results showed:

- v1.0: 13/17 verification checks passed.
- v1.1: 17/17 verification checks passed.
- All four previous failures were resolved.
- Total actual rudder stop duration decreased from
  45.5 seconds to 36.6 seconds, a 19.6% reduction.

This demonstrates how telemetry analysis supports
failure investigation, regression testing, and
engineering decision-making.

These findings apply to the tested simulation conditions
and do not establish complete real-world vessel reliability.

