// controllers/rejectedFilesController.js
import RejectedApplication from "../models/rejectedApplication.js";

// GET /api/rejected — only files belonging to the logged-in user
export const listRejected = async (req, res) => {
  try {
    const docs = await RejectedApplication.find({ dealer: req.user._id }).lean();
    res.json(Array.isArray(docs) ? docs : []);
  } catch (err) {
    console.error("listRejected error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/rejected/:id (with ownership check)
export const getRejectedById = async (req, res) => {
  try {
    const doc = await RejectedApplication.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });

    // Ownership check: ensure the file belongs to the logged-in user
    if (doc.dealer?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(doc);
  } catch (err) {
    console.error("getRejectedById error:", err);
    res.status(500).json({ error: err.message });
  }
};
