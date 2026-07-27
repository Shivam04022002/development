import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { logEvent } from "../utils/log.js";


const JWT_SECRET = process.env.JWT_SECRET || "keywasherebutitwillchanged";

const loginUser = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) 
        return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user)
        return res.status(401).json({ message: "Invalid email or password1" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
        return res.status(401).json({ message: "Invalid email or password" });

    // Update login tracking timestamps
    user.lastLoginAt = new Date();
    user.lastSeenAt = new Date();
    await user.save({ validateModifiedOnly: true });

    // 30-day expiry for biometric persistence across app restarts
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "30d" });
    logEvent("login", { userId: String(user._id), email: user.email, kind: "dealer" });
    res.json({
        token,
        user: {
            _id: user._id,
            name: user.Name  || user.name, // Use Name if available, otherwise fallback to name
            email: user.email,
            
        }
       
        
    });
     console.log(user);
};

/**
 * Refresh Token
 * Validates the current JWT (even if expired) and issues a new one.
 * The user must still exist in the database.
 */
const refreshToken = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(" ")[1];

        // Verify token - allow expired tokens for refresh
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        } catch (err) {
            console.error("[AUTH] Token decode failed during refresh:", err.message);
            return res.status(401).json({ message: "Invalid token" });
        }

        // Ensure user still exists
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        // Update last seen timestamp for activity tracking
        user.lastSeenAt = new Date();
        await user.save({ validateModifiedOnly: true });

        // Issue new token with 30-day expiry
        const newToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "30d" });
        console.log(`[AUTH] Token refreshed for ${user.email}`);

        res.json({
            token: newToken,
            user: {
                _id: user._id,
                name: user.Name || user.name,
                email: user.email,
            }
        });
    } catch (error) {
        console.error("Token refresh error:", error);
        res.status(500).json({ message: "Server error during token refresh" });
    }
};

/**
 * Validate Token
 * Lightweight check to see if a token is still valid (not expired, user exists).
 * Returns { valid: true, user } or { valid: false, message }.
 */
const validateToken = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.json({ valid: false, message: "No token provided" });
        }

        const token = authHeader.split(" ")[1];

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            // Token is expired or invalid
            console.log("[AUTH] Token validation failed:", err.message);
            return res.json({ valid: false, expired: err.name === "TokenExpiredError", message: err.message });
        }

        // Ensure user still exists
        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res.json({ valid: false, message: "User not found" });
        }

        res.json({
            valid: true,
            user: {
                _id: user._id,
                name: user.Name || user.name,
                email: user.email,
            }
        });
    } catch (error) {
        console.error("Token validation error:", error);
        res.json({ valid: false, message: "Server error" });
    }
};


export { loginUser, refreshToken, validateToken };
export default loginUser;