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
