const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { protect } = require("../middleware/authMiddleware");

// POST /api/orders — place a new order
router.post("/", protect, async (req, res) => {
    const { orderItems, shippingAddress, subtotal, shippingPrice, totalPrice } = req.body;

    try {
        if (!orderItems || orderItems.length === 0) {
            return res.status(400).json({ message: "No items in order." });
        }

        const order = await Order.create({
            user: req.user._id,
            orderItems,
            shippingAddress,
            subtotal,
            shippingPrice,
            totalPrice,
        });

        res.status(201).json(order);

    } catch (error) {
        console.error("ORDER ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/orders/myorders — get logged in user's orders
router.get("/myorders", protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/orders/:id — get single order
router.get("/:id", protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate("user", "name email");
        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;