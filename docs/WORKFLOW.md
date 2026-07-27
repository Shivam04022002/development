# Workflow — DealerMitra V2

## Status vs Workflow Stage
`status` is the overall application state; `workflowStage` drives the pipeline.
Pending CIBIL is a **workflow stage**, never a status.

| Situation            | status     | workflowStage      |
|----------------------|------------|--------------------|
| New application      | `pending`  | `pending_cibil`    |
| After Credit Note    | `pending`  | `contact creation` |
| Final approval       | `approved` | `disbursed`        |
| Rejected / auto-reject | `rejected` | `rejected`       |

## Stages (ordered)
`pending_cibil` → `contact creation` → `house visit` → `document collection` →
`credit sanction` → `agreement` → `pre-disbursement documentation` →
`disbursed` (final).

## Pending CIBIL
New applications enter at `pending_cibil`. CIBIL runs immediately after
creation. If the score passes (or auto-reject is off) the application stays at
`pending_cibil` until the Credit Note is completed. Pending CIBIL applications
appear only in the Pending CIBIL list.

## Credit Note Transition
Completing the Credit Note (Update & Download) advances `workflowStage`
`pending_cibil → contact creation`. `status` stays `pending`. Only staff with
the `pending_cibil` permission (or super-admin) may complete it.

## Approval
Advancing to `disbursed` moves the record into `approvedApplications`
(`status: approved`).

## Rejection (manual + auto Low-CIBIL)
- **Manual:** staff reject → record moves to `rejectedApplications`.
- **Auto Low-CIBIL:** if `score < minimumScore` and `autoRejectLowCibil` is on,
  the application is moved to `rejectedApplications` with `status: rejected`,
  `workflowStage: rejected`, `rejectedBy: System`, and the configured reason.
Both appear in the existing Rejected module.

## Permissions per Stage
Access is governed by each admin's `workflows` array (Staff Management). A staff
member may hold any subset of stages, including `pending_cibil`. Super-admin has
full access. Pending / Pending-CIBIL lists are filtered to the caller's assigned
stages.
