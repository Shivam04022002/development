# Database — DealerMitra V2

MongoDB (Mongoose 8). Both backends share one database. Below are the
collections that matter for V2 and their key fields/indexes.

## Collections

### applications
The single source of truth for an in-progress application.
- Embeds `applicant`, `coApplicant`, `vehicleDetails`, `documents` (relative
  file paths), `dealer` + `dealerDetails`, `branch`.
- `status` (`pending` | `approved` | `rejected`), `workflowStage`
  (`pending_cibil` … `disbursed`), `cibil` summary (`score, status, state,
  reportDate, requestId, fetchedAt`), `history`, audit fields.
- **Indexes:** `formId` (sparse), `status`, `workflowStage`,
  `{status, workflowStage}`, `{workflowStage, createdAt:-1}`, `createdAt:-1`,
  `dealer`, `dealerDetails.branch`, `dealerDetails.district`.

### cibilreports
Internal vendor record, one per application (`applicationId` **unique**).
`rawRequest` (no secrets), `rawResponsePath` (relative path to the raw JSON on
disk), `reportUrl`, `requestId`, `vendor`. Never exposed via APIs/UI.

### creditnotes
One per application (`applicationId` **unique**). Credit Note fields +
`pdfPath` (relative), `createdBy`, `updatedBy`, timestamps.

### applicationHistories
Append-only audit log. `applicationId`, `formId`, `actionType`
(`FORM_CREATED`, `CIBIL_*`, `STAGE_CHANGED`, `APPROVED`, `REJECTED`, …),
`oldValue`, `newValue`, `remarks`, `updatedBy`, `updatedAt`.
- **Indexes:** `{formId, updatedAt:-1}`, `{applicationId, updatedAt:-1}`,
  `updatedByAdminId`, `actionType`.

### approvedApplications / rejectedApplications
Terminal collections. Records move here on approval / rejection (including
Low-CIBIL auto-reject). Rejected records carry `rejection`, `workflowStage`
`"rejected"`, and a CIBIL summary. Indexed on `formId`, `status`, `createdAt`,
branch/district.

### users
Dealers. `email` (unique), `UserId` (unique), `Branch`, `District`, hashed
`password`, activity timestamps.

### admins
Staff / super-admin. `email` (unique), hashed `password`, `role`
(`admin` | `superadmin`), `workflows` (assigned stage permissions), `isActive`.

### branches
`name` (unique).

### systemsettings
Singleton (`key: "system"`). Holds the `cibil` configuration; `password` and
`clientSecret` are AES-256-GCM encrypted at rest.

## Query notes
- Pending / Pending-CIBIL lists filter by `workflowStage` and sort by
  `createdAt` — served by the `{workflowStage, createdAt:-1}` compound index.
- Dashboard stats use a single grouped aggregation per collection.
- Full-text-style search uses case-insensitive regex over denormalized fields
  (formId, applicant name/mobile/PAN/Aadhaar, dealer, branch); acceptable at the
  current scale.
