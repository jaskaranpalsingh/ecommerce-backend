const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
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

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "No account with that email found." });
        }

        // Generate token
        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

        // ✅ Use updateOne to avoid triggering pre-save hook
        await User.updateOne(
            { _id: user._id },
            {
                resetPasswordToken: hashedToken,
                resetPasswordExpire: Date.now() + 15 * 60 * 1000,
            }
        );

        const resetUrl = `http://localhost:5174/reset-password/${resetToken}`;

        await sendEmail({
            to: user.email,
            subject: "NURFIA — Password Reset Request",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: #0f172a; padding: 32px; text-align: center;">
                        <h1 style="color: #ffffff; font-size: 28px; letter-spacing: 6px; margin: 0;">NURFIA</h1>
                    </div>
                    <div style="padding: 36px 32px;">
                        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 12px;">Reset Your Password</h2>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.7; margin-bottom: 24px;">
                            We received a request to reset your password. Click the button below.
                            This link expires in <strong>15 minutes</strong>.
                        </p>
                        <a href="${resetUrl}"
                            style="display: inline-block; background: #0f172a; color: #ffffff; padding: 13px 28px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 600;">
                            Reset Password →
                        </a>
                        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                            If you didn't request this, you can safely ignore this email.
                        </p>
                    </div>
                </div>
            `,
        });

        res.json({ message: "Password reset email sent." });

    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/auth/reset-password/:token
router.post("/reset-password/:token", async (req, res) => {
    const { password } = req.body;

    try {
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset token." });
        }

        // ✅ Use updateOne to avoid triggering pre-save hook on reset token fields
        // but we need password hashed, so use save() only for password change
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.json({ message: "Password reset successful. You can now log in." });

    } catch (error) {
        console.error("RESET PASSWORD ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;