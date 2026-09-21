# PagerDuty provider candidate

This fixture-backed candidate maps PagerDuty incident response beneath canonical `workflows` and `schedules`. It keeps incidents, escalation levels, responders and rotations as provider provenance, separates observation, incident invocation and schedule mutation authority, and treats Events API, REST API and notification health independently.

Mutation is limited to exact approved sandbox schedule configuration with revision and read-after-write checks. Fixture evidence covers coverage, deduplication, notification failure, partial outage, stale state, missed escalation, noise, drift, correlation and portability. Governed/current promotion remains blocked until equivalent live non-production evidence is supplied.
