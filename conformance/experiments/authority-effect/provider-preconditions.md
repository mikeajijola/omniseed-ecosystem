# Reference Provider effect-binding audit

This conformance audit records what the implemented reference candidates can prove at their bounded mutation boundary. It is evidence about the current fixtures, not a claim about every vendor API or a live deployment.

| Provider | Approved identity | Boundary currentness | Replay/conditional mechanism | Authoritative outcome |
| --- | --- | --- | --- | --- |
| ServiceNow | exact plan digest, table, record, fields | expected record revision | record conflict rejects changed revision | Table API readback plus audit-history reference |
| Snowflake | exact plan digest, object and change | expected object revision | concurrent-change rejection | object/query readback plus Access History |
| Confluent | exact plan digest, topic, connector and configuration | expected connector revision | event idempotency key and connector conflict | destination observation plus connector/audit readback |
| PagerDuty | exact plan digest, schedule/policy configuration | expected schedule revision | event deduplication key and configuration conflict | incident/schedule state plus Audit Trail |
| MongoDB Atlas | exact plan digest, namespace and change | expected resource revision | stale-write rejection | record/configuration digest plus audit evidence |
| Workday | exact plan digest, resource, effective date and fields | expected record revision | conflict rejection; pending is non-converged | final effective record plus audit/business-event evidence |
| Splunk Cloud | exact plan digest, dataset and saved-search configuration | expected configuration revision | synthetic event identity and conflict rejection | search/readback plus audit evidence |

No candidate claims universal atomicity. Each returns failure for a known precondition mismatch and `INDETERMINATE` where acceptance lacks authoritative outcome evidence. Provider credentials remain separate from authority lineage. The shared simulation injects state and operation changes after verification and proves that no effect is counted.

Semantic review result: the current canonical separation of plan, approval, Provider apply, observation, evidence and capability evaluation can express both findings. The experiment identifies a portable delegation-lineage input gap in the immediate Engine permission gate, but does not justify importing JWT/RAR or execution-finality draft terminology into Company capabilities. Any production lineage contract requires a separate reviewed proposal.
