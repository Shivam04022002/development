# Changelog — DealerMitra V2

> Placeholder. To be completed.

## [Unreleased]

### Added
- **RC & Number Plate module.** Dealers upload the Registration Certificate and
  number plate for approved applications from the mobile app; admins review them
  and maintain SPDC details in the Admin Portal. Adds `rcDetails`,
  `numberPlateDetails` and `spdcDetails` to approved applications, nine new
  endpoints, two dealer dashboard cards, and the Admin Portal's
  "RC & Number Plate" listing and Vehicle Details pages.
  See [RC_NUMBER_PLATE.md](RC_NUMBER_PLATE.md) for APIs, workflows, migration
  and rollback.
- Optional migration `admin-backend/scripts/backfillVehicleDocs.mjs`
  (idempotent, `--dry-run` supported, never auto-runs).

### Changed
- Mobile backend no longer serves RC / number plate / SPDC images from the
  public `/files` route; they are available only through authenticated
  `/api/files`. Pre-existing vehicle photos are unaffected.
- `admin-backend` gained `multer` so the Admin Portal can upload the SPDC image,
  using the same disk-storage configuration as the mobile backend.

### Removed
