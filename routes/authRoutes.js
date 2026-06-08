const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
const { protect } = require("../middleware/authMiddleware");

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// Generate random OTP (6 digits)
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// POST /api/auth/register
router.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const user = await User.create({ name, email, password });

        await sendEmail({
            to: user.email,
            subject: "Welcome to NURFIA 🎉",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: #0f172a; padding: 32px; text-align: center;">
                        <h1 style="color: #ffffff; font-size: 28px; letter-spacing: 6px; margin: 0;">NURFIA</h1>
                    </div>
                    <div style="padding: 36px 32px;">
                        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 12px;">Welcome, ${user.name}! 👋</h2>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.7; margin-bottom: 24px;">
                            Thank you for creating your NURFIA account. We're thrilled to have you on board.
                            Start exploring our premium collection today.
                        </p>
                        <a href="http://localhost:5174"
                            style="display: inline-block; background: #0f172a; color: #ffffff; padding: 13px 28px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 600;">
                            Start Shopping →
                        </a>
                        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                            If you didn't create this account, you can safely ignore this email.
                        </p>
                    </div>
                </div>
            `,
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            token: generateToken(user._id),
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        console.error("LOGIN ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/auth/forgot-password — Send OTP
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "No account with that email found." });
        }

        // Generate OTP
        const otp = generateOTP();

        // Save OTP with 10 minute expiry
        await User.updateOne(
            { _id: user._id },
            {
                resetOTP: otp,
                resetOTPExpire: Date.now() + 10 * 60 * 1000,
            }
        );

        // Send OTP email
        await sendEmail({
            to: user.email,
            subject: "NURFIA — Password Reset OTP",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: #0f172a; padding: 32px; text-align: center;">
                        <h1 style="color: #ffffff; font-size: 28px; letter-spacing: 6px; margin: 0;">NURFIA</h1>
                    </div>
                    <div style="padding: 36px 32px;">
                        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 12px;">Reset Your Password</h2>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.7; margin-bottom: 24px;">
                            We received a request to reset your password. Use the OTP below within <strong>10 minutes</strong>.
                        </p>
                        <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 24px;">
                            <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Your OTP:</p>
                            <p style="font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 4px; margin: 0;">${otp}</p>
                        </div>
                        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                            If you didn't request this, you can safely ignore this email.
                        </p>
                    </div>
                </div>
            `,
        });

        res.json({ message: "OTP sent to your email. Check your inbox." });

    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/auth/verify-otp — Verify OTP and reset password
router.post("/verify-otp", async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        const user = await User.findOne({
            email,
            resetOTP: otp,
            resetOTPExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired OTP." });
        }

        // Update password and clear OTP
        user.password = newPassword;
        user.resetOTP = undefined;
        user.resetOTPExpire = undefined;
        await user.save();

        res.json({ message: "Password reset successful. You can now log in." });

    } catch (error) {
        console.error("VERIFY OTP ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/auth/profile - Fetch user profile details
router.get("/profile", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        if (user) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        console.error("GET PROFILE ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/auth/profile - Update user profile details
router.put("/profile", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;

            if (req.body.password) {
                user.password = req.body.password;
            }

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                isAdmin: updatedUser.isAdmin,
                token: generateToken(updatedUser._id),
            });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;