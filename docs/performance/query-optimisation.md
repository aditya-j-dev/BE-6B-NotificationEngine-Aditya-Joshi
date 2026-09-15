# Day 11.8: Query optimisation evidence

## Query-to-index mapping

| Read path | Index | Reason |
| --- | --- | --- |
| Event-sourced delivery rates and time series | `NotificationStateLog_terminal_createdAt_idx` | Restricts the terminal-state analytics scan to the three terminal delivery statuses in a time range. |
| Opt-out trends | `ConsentAuditLog_action_createdAt_idx` | Matches `action = 'OPT_OUT'` plus the date-range sort/filter. |
| Cost analytics | `Notification_cost_analytics_idx` | Covers billed notifications only and supports the date/channel/provider filters. |

`NotificationStateLog_createdAt_brin_idx` remains the compact broad time-range
index added in Day 10.6. The terminal-state index complements it for the
recurring dashboard query; it does not replace it.

## Evidence collection

Run `scripts/performance/explain-analytics.sql` before migration and save the
output as `docs/performance/evidence/explain-before.txt`. Apply the migration,
run the script again, and save it as `explain-after.txt`. Compare planning time,
execution time, buffer reads, and whether the planner selects the intended
index. Small or empty local databases may still choose a sequential scan; that
does not prove an index is ineffective at production-scale cardinality.
