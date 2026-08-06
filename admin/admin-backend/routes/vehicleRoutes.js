// routes/vehicleRoutes.js
//
// RC & Number Plate module — admin endpoints. Mounted at /api/admin/vehicle.
// `protect` is the existing admin auth middleware; it populates req.admin, so
// every route here is admin-only. Dealer tokens are issued by the Mobile
// Backend against the User collection and never resolve to an Admin, so a
// dealer cannot reach these routes.
//
import express from "express";
import protect from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import {
  listVehicleDocuments,
  getVehicleDetails,
  updateVehicleDetails,
  uploadSpdcImage,
} from "../controllers/vehicleController.js";

const router = express.Router();

router.use(protect);

/**
 * Accept one image in the `spdcImage` field and translate multer's own
 * rejections (unsupported type, too large) into 400s, matching how the Mobile
 * Backend's upload route reports them.
 */
const receiveSpdcImage = (req, res, next) => {
  upload.single("spdcImage")(req, res, (err) => {
    if (!err) return next();
    const isValidation =
      err.code === "LIMIT_FILE_SIZE" || /Unsupported file type/.test(err.message || "");
    console.error("[SPDC-UPLOAD] error:", err.message || err);
    return res
      .status(isValidation ? 400 : 500)
      .json({ error: "Upload failed", details: String(err.message || err) });
  });
};

// /list must be declared before /:applicationId so it is not swallowed by it.
router.get("/list", listVehicleDocuments);
router.post("/:applicationId/spdc-image", receiveSpdcImage, uploadSpdcImage);
router.get("/:applicationId", getVehicleDetails);
router.put("/:applicationId", updateVehicleDetails);

export default router;
