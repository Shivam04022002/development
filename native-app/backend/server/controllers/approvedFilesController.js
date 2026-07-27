import ApprovedApplication from "../models/ApprovedApplication.js";

// GET /api/approved-files — only files belonging to the logged-in user
export const getApprovedFiles = async (req, res) => {
  try {
    const files = await ApprovedApplication.find({ dealer: req.user._id })
      .select("formId applicant coApplicant vehicleDetails dealer dealerDetails status workflowStage approval createdAt updatedAt")
      .populate("dealer", "name email branch district")
      .sort({ updatedAt: -1 })
      .lean();

    // Return empty array (not 404) for consistency with mobile UI lists
    return res.status(200).json(files || []);
  } catch (err) {
    console.error("Error fetching approved files:", err);
    return res.status(500).json({ message: "Server error fetching approved files" });
  }
};

// GET /api/approved-files/:id (with ownership check)
export const getApprovedFileById = async (req, res) => {
  try {
    const file = await ApprovedApplication.findById(req.params.id)
      .populate("dealer", "name email branch district")
      .lean();

    if (!file) return res.status(404).json({ message: "Approved application not found" });

    // Ownership check: ensure the file belongs to the logged-in user
    const dealerId = file.dealer?._id?.toString() || file.dealer?.toString();
    if (dealerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.status(200).json(file);
  } catch (err) {
    console.error("Error fetching approved file by id:", err);
    return res.status(500).json({ message: "Server error fetching approved file" });
  }
};
