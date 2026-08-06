// routes/dashboardRoutes.js
//
// RC & Number Plate module — dealer dashboard counters.
// Mounted at /api/dashboard.
//
import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import { getVehicleCounts } from "../controllers/vehicleDocsController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/vehicle-counts", getVehicleCounts);

export default router;
