const express = require("express");
const router = express.Router();
const Coupon = require("../models/Coupon");
const { protect } = require("../middleware/authMiddleware");

// ─── Admin: GET all coupons ───────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── Admin: CREATE coupon ─────────────────────────────────────────────────────
router.post("/", async (req, res) => {
    const { code, type, value, minOrder, maxUses, expiry, isActive } = req.body;
    try {
        const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (existing) {
            return res.status(400).json({ message: "A coupon with this code already exists." });
        }
        const coupon = await Coupon.create({
            code,
            type,
            value,
            minOrder: minOrder || 0,
            maxUses: maxUses || null,
            expiry: expiry || null,
            isActive: isActive !== undefined ? isActive : true,
        });
        res.status(201).json(coupon);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ─── Admin: UPDATE coupon ─────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!coupon) return res.status(404).json({ message: "Coupon not found" });
        res.json(coupon);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ─── Admin: DELETE coupon ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) return res.status(404).json({ message: "Coupon not found" });
        res.json({ message: "Coupon deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── Customer: APPLY coupon (validate + calculate discount) ──────────────────
router.post("/apply", protect, async (req, res) => {
    const { code, orderTotal } = req.body;

    if (!code) return res.status(400).json({ message: "Please provide a coupon code." });
    if (!orderTotal || orderTotal <= 0) return res.status(400).json({ message: "Invalid order total." });

    try {
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

        if (!coupon) return res.status(404).json({ message: "Coupon code not found." });
        if (!coupon.isActive) return res.status(400).json({ message: "This coupon is no longer active." });

        // Check expiry
        if (coupon.expiry && new Date() > new Date(coupon.expiry)) {
            return res.status(400).json({ message: "This coupon has expired." });
        }

        // Check max uses
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
            return res.status(400).json({ message: "This coupon has reached its maximum usage limit." });
        }

        // Check minimum order
        if (orderTotal < coupon.minOrder) {
            return res.status(400).json({
                message: `Minimum order of $${coupon.minOrder.toFixed(2)} required for this coupon.`,
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (coupon.type === "percentage") {
            discountAmount = (orderTotal * coupon.value) / 100;
        } else {
            discountAmount = Math.min(coupon.value, orderTotal); // can't discount more than order total
        }

        discountAmount = parseFloat(discountAmount.toFixed(2));
        const newTotal = parseFloat((orderTotal - discountAmount).toFixed(2));

        res.json({
            success: true,
            couponId: coupon._id,
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            discountAmount,
            newTotal,
            message: `Coupon applied! You saved $${discountAmount.toFixed(2)}.`,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
