# W09-R2 parent dashboard ownership

Base: 0a80b77 (W09-R1). The W09-R1 independent tests revealed that a failed refresh leaves an unlabeled stale child count, and replacing the authenticated parent while the component remains mounted retains the previous parent's children.

| Situation | Required behavior | Verification |
| --- | --- | --- |
| Dashboard refresh fails after success | Hide old dashboard data, show error and allow retry; preserve successfully loaded groups | component regression and retry |
| User identity changes or becomes null | Immediately hide previous identity's data; start a new load for an authenticated identity; invalidate previous requests | component account replacement and delayed response tests |
| Same identity reloads or unmounts | Most recent request owns state; cleanup invalidates pending results | W09-R1 request tests |
| Successful empty/zero | Display real zero or empty state | existing W09 tests |
| Groups fail while dashboard succeeds | Preserve dashboard data, show group error and retry | existing W09 tests |
| Reward targets and capabilities | Preserve W06 epoch guards and W08 gates | existing reward tests |

Student dashboard error suppression remains the previously documented follow-up. W09/S3 closure remains qualified. No API, schema, authorization or funding changes.
