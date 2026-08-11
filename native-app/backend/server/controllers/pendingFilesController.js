// controllers/pendingFilesController.js
import PendingFiles from "../models/pendingFiles.js";

// Get all pending files for the logged-in dealer
export const getPendingFiles = async (req, res) => {
  try {
    const pendingFiles = await PendingFiles.find({
      status: "pending",
      dealer: req.user._id,
    }).populate("user", "name email");

    // Return empty array (not 404) for consistency with mobile UI lists
    res.status(200).json(pendingFiles || []);
  } catch (error) {
    console.error("Error fetching pending files:", error);
    res.status(500).json({ message: "Server error fetching pending files" });
  }
};

// Get a single pending file by ID (with ownership check)
export const getPendingFileById = async (req, res) => {
  try {
    // .lean() — this model declares a narrow subset of the shared `applications`
    // collection, so a hydrated read drops everything the Admin Backend owns:
    // `cibil` (score, state, subjectPan) and the applicant / co-applicant fields
    // beyond name, email, phone and pan. The detail screen renders those, so it
    // needs the stored document as it is, exactly like the by-formid read.
    const file = await PendingFiles.findById(req.params.id)
      .populate("user", "name email")
      .lean();

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Ownership check: ensure the file belongs to the logged-in dealer
    if (file.dealer?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json(file);
  } catch (error) {
    console.error("Error fetching file by ID:", error);
    res.status(500).json({ message: "Server error fetching file" });
  }
};

