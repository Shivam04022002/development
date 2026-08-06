// routes/rcRoutes.js
//
// RC & Number Plate module — dealer RC endpoints. Mounted at /api/rc.
// requireAuth resolves the dealer; ownership is enforced in the controller.
//
import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import {
  getRcPending,
  uploadRc,
  receiveVehicleFiles,
} from "../controllers/vehicleDocsController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getRcPending);
router.post("/upload/:applicationId", receiveVehicleFiles, uploadRc);

export default router;
