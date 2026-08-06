// routes/dealerActionRoutes.js
//
// Dealer Action Center. Mounted at /api/dealer-actions.
// requireAuth resolves the dealer; ownership is enforced in the controller.
//
import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import {
  listDealerActions,
  getApplicationActions,
  receiveReplacement,
  replaceDocument,
} from "../controllers/dealerActionsController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", listDealerActions);
router.get("/:applicationId", getApplicationActions);
router.post(
  "/:applicationId/documents/:role/:field",
  receiveReplacement,
  replaceDocument
);

export default router;
