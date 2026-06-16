const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { protect } = require("../middleware/authMiddleware");
const sendEmail = require("../utils/sendEmail");

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

        // Send order confirmation email asynchronously
        try {
            const itemsHtml = orderItems.map(item => `
                <tr style="border-bottom: 1px solid #edf2f7;">
                    <td style="padding: 12px; font-size: 14px; color: #2d3748;">
                        <div style="font-weight: 600;">${item.title}</div>
                    </td>
                    <td style="padding: 12px; text-align: center; font-size: 14px; color: #4a5568;">${item.qty}</td>
                    <td style="padding: 12px; text-align: right; font-size: 14px; color: #2d3748; font-weight: 600;">$${item.price.toFixed(2)}</td>
                </tr>
            `).join("");

            const emailHtml = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                    <div style="text-align: center; border-bottom: 2px solid #5b21b6; padding-bottom: 20px; margin-bottom: 25px;">
                        <h1 style="color: #5b21b6; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 2px;">NURFIA</h1>
                        <p style="color: #718096; font-size: 14px; margin: 5px 0 0 0;">Premium Apparel Store</p>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <h2 style="font-size: 20px; color: #1a202c; margin: 0 0 10px 0;">Order Confirmed! 🎉</h2>
                        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Hi ${shippingAddress.fullName || req.user.name},</p>
                        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0;">Thank you for your order. We are processing it and will let you know as soon as it ships.</p>
                        <div style="background-color: #f7fafc; padding: 12px 20px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #5b21b6;">
                            <span style="color: #718096; font-size: 13px; display: block;">Order Reference</span>
                            <strong style="color: #2d3748; font-size: 16px;">#ORD-${order._id.toString().slice(-6).toUpperCase()}</strong>
                        </div>
                    </div>

                    <h3 style="font-size: 16px; color: #1a202c; border-bottom: 1px solid #edf2f7; padding-bottom: 8px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                        <thead>
                            <tr style="background-color: #f7fafc;">
                                <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #718096; text-transform: uppercase; font-weight: 700;">Item</th>
                                <th style="padding: 10px 12px; text-align: center; font-size: 12px; color: #718096; text-transform: uppercase; font-weight: 700; width: 60px;">Qty</th>
                                <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #718096; text-transform: uppercase; font-weight: 700; width: 90px;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div style="margin-bottom: 30px; text-align: right; font-size: 14px; color: #4a5568; line-height: 1.8;">
                        <div>Subtotal: <span style="font-weight: 600; color: #2d3748;">$${subtotal.toFixed(2)}</span></div>
                        <div>Shipping: <span style="font-weight: 600; color: #2d3748;">${shippingPrice === 0 ? "FREE" : `$${shippingPrice.toFixed(2)}`}</span></div>
                        <div style="font-size: 18px; margin-top: 10px; border-top: 1px solid #edf2f7; padding-top: 10px; color: #5b21b6; font-weight: 700;">
                            Grand Total: <span>$${totalPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 30px; padding: 20px; background-color: #f7fafc; border-radius: 8px; font-size: 14px; border: 1px solid #e2e8f0;">
                        <h4 style="margin: 0 0 10px 0; color: #1a202c; font-size: 15px; font-weight: 700;">Delivery Address</h4>
                        <p style="margin: 2px 0; color: #4a5568;"><strong>${shippingAddress.fullName}</strong></p>
                        <p style="margin: 2px 0; color: #4a5568;">${shippingAddress.address}</p>
                        <p style="margin: 2px 0; color: #4a5568;">${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}</p>
                        <p style="margin: 8px 0 0 0; color: #718096; font-size: 13px;">📞 Phone: ${shippingAddress.phone}</p>
                    </div>

                    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #a0aec0; border-top: 1px solid #edf2f7; padding-top: 20px;">
                        <p style="margin: 0 0 5px 0;">You can track this order in your account dashboard anytime.</p>
                        <p style="margin: 0;">&copy; 2026 NURFIA Store. All rights reserved.</p>
                    </div>
                </div>
            `;

            await sendEmail({
                to: req.user.email,
                subject: `NURFIA - Order Confirmation #ORD-${order._id.toString().slice(-6).toUpperCase()}`,
                html: emailHtml
            });
        } catch (emailErr) {
            console.error("Failed to send order confirmation email:", emailErr.message);
        }

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