import User from "../models/User.js";
import bcrypt from "bcryptjs";

/**
 * Get dealer profile
 * GET /api/profile
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: user.name || "",
      email: user.email || "",
      phone: user.Contact || user.mobileNumber || "",
      branch: user.Branch || user.branchName || "",
      profilePic: user.profilePic || ""
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    res.status(500).json({ message: "Server error fetching profile" });
  }
};

/**
 * Update dealer profile (name, email, phone, branch, profilePic)
 * PUT /api/profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, phone, branch, profilePic } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) {
      updateData.Contact = phone;
      updateData.mobileNumber = phone;
    }
    if (branch !== undefined) {
      updateData.Branch = branch;
      updateData.branchName = branch;
    }
    if (profilePic !== undefined) updateData.profilePic = profilePic;

    // Check if email is being changed to one that already exists
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use by another account" });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.Contact || updatedUser.mobileNumber || "",
        branch: updatedUser.Branch || updatedUser.branchName || "",
        profilePic: updatedUser.profilePic,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({ message: "Server error updating profile" });
  }
};

/**
 * Change dealer password
 * PUT /api/profile/password
 */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ message: "New password and confirm password are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ message: "Server error changing password" });
  }
};
