# RC & Number Plate Module

Vehicle-document capture for approved loan applications: dealers upload the
Registration Certificate and the number plate from the mobile app; admins review
them and maintain the SPDC record from the Admin Portal.

---

## Where the data lives

The three sections hang off the **approved** application, in the
`approvedApplications` collection.

> Approval does not flag an application — it **moves** it. `updateWorkflowStage`
> / `approveApplicationCore` copy the record into `ApprovedApplication` and
> delete the `Application` document. Eligibility for RC / Number Plate upload
> begins at approval, so this is where the sections are read and written. The
> same schema is also declared on `Application` so an in-flight application
> carries the sections through approval rather than having them invented there.

```js
rcDetails:          { status: "Pending"|"Uploaded", frontImage, backImage, uploadedAt, uploadedBy → User }
numberPlateDetails: { status: "Pending"|"Uploaded", plateNumber, image, uploadedAt, uploadedBy → User }
spdcDetails:        { number, image, updatedAt, updatedBy → Admin }
```

Defined once in `models/vehicleDocSchemas.js` (mirrored in both backends — they
share the collection, and a field missing from either copy would be silently
stripped by Mongoose strict mode).

**Images are stored as RELATIVE paths** under the shared uploads root, e.g.
`applications/<loanNo>/vehicle/rc-front.jpg`. Never absolute, never a URL.

### Indexes (on `approvedApplications`)

```
{ dealer: 1, "rcDetails.status": 1 }            dealer pending list + count
{ dealer: 1, "numberPlateDetails.status": 1 }   dealer pending list + count
{ "rcDetails.status": 1 }                       admin list
{ "numberPlateDetails.status": 1 }              admin list
```

### A rule that constrains every write

On approved records, `updatedAt` is the approval-time proxy that the Processing
Days export falls back to for documents predating `approvedAt`. **Every write in
this module therefore uses `{ timestamps: false }`**, and the migration script
uses the native driver. Upload time is recorded in `rcDetails.uploadedAt` /
`numberPlateDetails.uploadedAt` instead.

---

## APIs

### Dealer — Mobile Backend (`requireAuth`, dealer token)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/rc/pending` | Own approved apps with RC pending. `?search=` matches Loan Number, Customer Name, Mobile — **server-side**. |
| `POST` | `/api/rc/upload/:applicationId` | multipart `rcFront` + `rcBack`, both required. |
| `GET` | `/api/number-plate/pending` | As above, for number plate. |
| `POST` | `/api/number-plate/upload/:applicationId` | multipart `plateImage` + field `plateNumber`, both required. |
| `GET` | `/api/dashboard/vehicle-counts` | `{ rcPending, numberPlatePending }` for the logged-in dealer. |

Every query is scoped to `dealer: req.user._id`. Uploading against another
dealer's application returns **403**; a section already `Uploaded` returns
**409** — dealers upload once and cannot edit afterwards.

### Admin — Admin Backend (`protect`, admin token)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/vehicle/list` | `search`, `dealer`, `type=RC\|NUMBER_PLATE`, `status=Pending\|Uploaded`, `page`, `limit`. All server-side. |
| `GET` | `/api/admin/vehicle/:applicationId` | Full record incl. `{ path, url }` refs for each image. |
| `PUT` | `/api/admin/vehicle/:applicationId` | Editable: `rcStatus`, `numberPlate`, `spdcNumber`, `spdcImage`. |
| `POST` | `/api/admin/vehicle/:applicationId/spdc-image` | multipart `spdcImage`. **Stages only** — `PUT` commits. |

---

## Upload workflow

Both backends run **one** upload system: multer → disk, into
`applications/_staging`, then relocated into the application folder by
`moveIntoApp()`. Shared constraints live in each backend's `utils/fileStorage.js`
and are identical: `jpg jpeg png webp gif bmp pdf`, **15 MB** max.

**Dealer upload** — multipart request → multer stages the files → ownership and
duplicate checks → `moveIntoApp` files them as `rc-front.<ext>` / `rc-back.<ext>`
/ `number-plate.<ext>` → record updated. Any rejection deletes the staged files.

**Admin SPDC upload** — `POST …/spdc-image` stages the file and returns its
reference; the page previews it as *"not saved yet"*; **`PUT` commits it**,
relocating to `spdc.<ext>`.

> The split is deliberate. Committing at upload time would break Cancel twice
> over: the record would already be changed, and because the stored file always
> has the basename `spdc.<ext>`, a cancelled upload would have overwritten the
> previous image on disk. A cancelled upload leaves an orphan in `_staging` —
> harmless, and the same as the dealer flow.

### File access

- Admin portal reads images through **authenticated** `GET /api/files/<path>`.
- The mobile backend's public `/files` route **excludes** `rc-front`, `rc-back`,
  `number-plate` and `spdc` — vehicle documents are not publicly readable.
- `absFromRel()` blocks path traversal on every read, and `PUT` refuses an
  `spdcImage` that does not resolve to a readable file under the uploads root.

---

## Dealer workflow

Dashboard (**RC Upload** / **Number Plate** count cards) → list screen with
server-side search → details screen → pick images (gallery; camera is wired but
needs a manifest permission, see Known Issues) → Submit.

On success the row leaves the list and the dashboard count drops on return, via
the dashboard's existing `useFocusEffect` refresh — no manual state updates.

## Admin workflow

Super Admin nav → **RC & Number Plate** → RC Uploads / Number Plate tabs, search,
dealer filter, pagination → **View** → Vehicle Details → **Edit** → change RC
Status / Number Plate / SPDC Number / SPDC Image → **Save Changes** (re-reads
from the server) or **Cancel** (restores, no API call).

### Business rules enforced server-side

- `rcStatus` may only become **Uploaded** when **both** RC images exist;
  otherwise `400` naming the missing side.
- `numberPlate` is trimmed, inner whitespace collapsed, **upper-cased**, and
  must be non-empty. **No RTO format validation.**
- `spdcNumber` is trimmed only.

---

## Audit logging

| Action | Record |
| --- | --- |
| Dealer RC upload | `logEvent("rc_uploaded")` |
| Dealer number plate upload | `logEvent("number_plate_uploaded")` |
| Admin field updates | `ActivityLog` `UPDATE_VEHICLE_DOCS` (+ `meta.changed`) and `logEvent("vehicle_docs_updated")` |
| Admin SPDC image upload | `ActivityLog` `UPLOAD_SPDC_IMAGE` and `logEvent("spdc_image_uploaded")` |

Logging failures never block the write.

---

## Migration

```bash
cd admin/admin-backend
node scripts/backfillVehicleDocs.mjs --dry-run   # report only
node scripts/backfillVehicleDocs.mjs             # apply
```

Initialises `rcDetails.status` / `numberPlateDetails.status` to `"Pending"` on
approved records that predate the module. Idempotent (`$exists: false` guard),
native-driver writes so `updatedAt` is untouched, prints a scanned / updated /
skipped / elapsed summary, and never runs automatically.

**Not strictly required** — every read path treats a missing section as
`Pending`, so existing records already work. Run it for uniform stored data.

`spdcDetails` is intentionally not backfilled: it has no defaulted field and is
legitimately absent until an admin fills it in.

---

## Rollback

The module is **purely additive** — no existing field was renamed, re-typed or
removed, and no existing endpoint changed shape.

1. **Code:** revert the feature commits. Existing flows are unaffected because
   nothing outside the module reads these fields.
2. **Routes:** removing the mounts (`/api/rc`, `/api/number-plate`,
   `/api/dashboard` on mobile; `/api/admin/vehicle` on admin) disables the
   feature without touching data.
3. **Data:** *no rollback needed.* `rcDetails` / `numberPlateDetails` /
   `spdcDetails` are ignored by every other code path. To remove them anyway:
   ```js
   db.approvedApplications.updateMany({}, { $unset: {
     rcDetails: "", numberPlateDetails: "", spdcDetails: ""
   }});
   ```
   ⚠️ This destroys uploaded document references. The **files** remain on disk
   under `applications/*/vehicle/`.
4. **Uploaded files** are inert once the code is reverted; delete them only if
   the feature is being abandoned.
5. **Dependency:** `multer` was added to `admin-backend`. Reverting
   `package.json` + `npm ci` removes it; nothing else imports it.
