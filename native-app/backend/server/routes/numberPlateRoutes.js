// routes/numberPlateRoutes.js
//
// RC & Number Plate module — dealer number-plate endpoints.
// Mounted at /api/number-plate.
//
import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import {
  getNumberPlatePending,
  uploadNumberPlate,
  receiveVehicleFiles,
} from "../controllers/vehicleDocsController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getNumberPlatePending);
router.post("/upload/:applicationId", receiveVehicleFiles, uploadNumberPlate);

export default router;
