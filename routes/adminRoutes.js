const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Review = require("../models/Review");
const sendEmail = require("../utils/sendEmail");

// GET /api/admin/dashboard - Fetch dashboard statistics and lists
router.get("/dashboard", async (req, res) => {
    try {
        // 1. Calculate stats
        const totalOrders = await Order.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalUsers = await User.countDocuments();

        const revenueAgg = await Order.aggregate([
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]);
        const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

        // 2. Fetch recent orders
        const recentOrdersDb = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("user", "name email");

        const recentOrders = recentOrdersDb.map(o => ({
            id: `#ORD-${o._id.toString().slice(-6).toUpperCase()}`,
            customer: o.shippingAddress?.fullName || o.user?.name || "Customer",
            product: o.orderItems.map(item => item.title).join(", ") || "No items",
            amount: `$${o.totalPrice.toFixed(2)}`,
            status: o.status || "Processing"
        }));

        // 3. Generate recent activity dynamically from recent orders and users
        const latestOrders = await Order.find().sort({ createdAt: -1 }).limit(8);
        const latestUsers = await User.find().sort({ createdAt: -1 }).limit(8);

        const activities = [];

        latestOrders.forEach(o => {
            if (o.status === "Cancelled") {
                activities.push({
                    dot: "red",
                    text: `Order #ORD-${o._id.toString().slice(-6).toUpperCase()} was cancelled`,
                    time: o.updatedAt || o.createdAt
                });
            } else {
                activities.push({
                    dot: "green",
                    text: `New order received from ${o.shippingAddress?.fullName || "Customer"}`,
                    time: o.createdAt
                });
            }
        });

        latestUsers.forEach(u => {
            activities.push({
                dot: "purple",
                text: `New user registered: ${u.name}`,
                time: u.createdAt
            });
        });

        // Sort by time descending and take top 5
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        const recentActivity = activities.slice(0, 5);

        res.json({
            stats: {
                totalRevenue: `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                totalOrders: totalOrders.toLocaleString(),
                totalProducts: totalProducts.toLocaleString(),
                totalUsers: totalUsers.toLocaleString()
            },
            recentOrders,
            recentActivity
        });

    } catch (error) {
        console.error("ADMIN DASHBOARD ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/users - Get all users with spent calculation
router.get("/users", async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });

        // Calculate total spent for each user dynamically from orders
        const usersWithSpent = await Promise.all(
            users.map(async (user) => {
                const userOrders = await Order.find({ user: user._id });
                const totalSpent = userOrders.reduce((sum, order) => sum + order.totalPrice, 0);

                return {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.isAdmin ? "Admin" : "Customer",
                    status: user.isBlocked ? "Blocked" : "Active",
                    spent: `$${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    joined: user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                        })
                        : "N/A"
                };
            })
        );

        res.json(usersWithSpent);
    } catch (error) {
        console.error("ADMIN GET USERS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/admin/users/:id/toggle-block - Toggle block status
router.put("/users/:id/toggle-block", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({
            message: `User ${user.isBlocked ? "blocked" : "unblocked"} successfully`,
            user: {
                id: user._id,
                name: user.name,
                isBlocked: user.isBlocked,
                status: user.isBlocked ? "Blocked" : "Active"
            }
        });
    } catch (error) {
        console.error("ADMIN TOGGLE BLOCK ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/admin/users/:id - Delete user
router.delete("/users/:id", async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("ADMIN DELETE USER ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/orders - Fetch all orders
router.get("/orders", async (req, res) => {
    try {
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .populate("user", "name email");

        const mappedOrders = orders.map(o => ({
            id: o._id,
            orderIdString: `#ORD-${o._id.toString().slice(-6).toUpperCase()}`,
            customer: o.shippingAddress?.fullName || o.user?.name || "Customer",
            product: o.orderItems.map(item => item.title).join(", ") || "No items",
            amount: `$${o.totalPrice.toFixed(2)}`,
            date: o.createdAt
                ? new Date(o.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                })
                : "N/A",
            status: o.status || "Processing"
        }));

        res.json(mappedOrders);
    } catch (error) {
        console.error("ADMIN GET ORDERS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/admin/orders/:id/status - Update order status
router.put("/orders/:id/status", async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];

    try {
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        const order = await Order.findById(req.params.id).populate("user");
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const oldStatus = order.status;
        order.status = status;
        
        // Update isDelivered flag if status changes to Delivered
        if (status === "Delivered") {
            order.isDelivered = true;
        }

        await order.save();

        // Send status change email
        if (oldStatus !== status && order.user && order.user.email) {
            try {
                const statusColors = {
                    Pending: "#d97706",
                    Processing: "#2563eb",
                    Shipped: "#7c3aed",
                    Delivered: "#16a34a",
                    Cancelled: "#dc2626"
                };
                const statusColor = statusColors[status] || "#4b5563";

                const emailHtml = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <div style="text-align: center; border-bottom: 2px solid #5b21b6; padding-bottom: 20px; margin-bottom: 25px;">
                            <h1 style="color: #5b21b6; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 2px;">NURFIA</h1>
                            <p style="color: #718096; font-size: 14px; margin: 5px 0 0 0;">Premium Apparel Store</p>
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                            <h2 style="font-size: 20px; color: #1a202c; margin: 0 0 10px 0;">Order Status Updated! 🚚</h2>
                            <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Hi ${order.shippingAddress?.fullName || order.user.name},</p>
                            <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0;">We want to let you know that your order status has been updated to:</p>
                            
                            <div style="background-color: #f7fafc; padding: 15px 20px; border-radius: 8px; margin-top: 15px; border-left: 4px solid ${statusColor};">
                                <span style="color: #718096; font-size: 13px; display: block;">Order Reference: <strong>#ORD-${order._id.toString().slice(-6).toUpperCase()}</strong></span>
                                <span style="color: ${statusColor}; font-size: 18px; font-weight: 700; display: block; margin-top: 5px;">${status}</span>
                            </div>
                        </div>

                        <h3 style="font-size: 16px; color: #1a202c; border-bottom: 1px solid #edf2f7; padding-bottom: 8px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Order Details</h3>
                        <div style="margin-bottom: 25px; font-size: 14px; color: #4a5568; line-height: 1.6;">
                            <p style="margin: 3px 0;"><strong>Items:</strong> ${order.orderItems.map(item => `${item.title} (x${item.qty})`).join(", ")}</p>
                            <p style="margin: 3px 0;"><strong>Total Amount:</strong> $${order.totalPrice.toFixed(2)}</p>
                        </div>

                        <div style="margin-bottom: 30px; padding: 20px; background-color: #f7fafc; border-radius: 8px; font-size: 14px; border: 1px solid #e2e8f0;">
                            <h4 style="margin: 0 0 10px 0; color: #1a202c; font-size: 15px; font-weight: 700;">Delivery Address</h4>
                            <p style="margin: 2px 0; color: #4a5568;"><strong>${order.shippingAddress?.fullName}</strong></p>
                            <p style="margin: 2px 0; color: #4a5568;">${order.shippingAddress?.address}</p>
                            <p style="margin: 2px 0; color: #4a5568;">${order.shippingAddress?.city}, ${order.shippingAddress?.state} - ${order.shippingAddress?.pincode}</p>
                        </div>

                        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #a0aec0; border-top: 1px solid #edf2f7; padding-top: 20px;">
                            <p style="margin: 0 0 5px 0;">You can check the real-time tracking timeline of your order anytime in your account dashboard.</p>
                            <p style="margin: 0;">&copy; 2026 NURFIA Store. All rights reserved.</p>
                        </div>
                    </div>
                `;

                await sendEmail({
                    to: order.user.email,
                    subject: `NURFIA - Order Status Updated: ${status} (#ORD-${order._id.toString().slice(-6).toUpperCase()})`,
                    html: emailHtml
                });
            } catch (emailErr) {
                console.error("Failed to send order status update email:", emailErr.message);
            }
        }

        res.json({ message: "Order status updated successfully", order });
    } catch (error) {
        console.error("ADMIN UPDATE ORDER STATUS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/search - Live global search for Products, Orders, Users
router.get("/search", async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.json({ products: [], users: [], orders: [] });
    }
    try {
        const regex = new RegExp(q, "i");
        
        // 1. Search products
        const products = await Product.find({ title: regex }).limit(4).select("title price image category");

        // 2. Search users
        const users = await User.find({
            $or: [{ name: regex }, { email: regex }]
        }).limit(4).select("name email isAdmin");

        // 3. Search orders
        const allOrders = await Order.find().populate("user", "name email");
        const orders = allOrders.filter(o => {
            const customerName = o.shippingAddress?.fullName || o.user?.name || "";
            const orderIdStr = o._id.toString();
            const shortId = `#ORD-${orderIdStr.slice(-6).toUpperCase()}`;
            return regex.test(customerName) || regex.test(orderIdStr) || regex.test(shortId);
        }).slice(0, 4).map(o => ({
            id: o._id,
            orderIdString: `#ORD-${o._id.toString().slice(-6).toUpperCase()}`,
            customer: o.shippingAddress?.fullName || o.user?.name || "Customer",
            amount: `$${o.totalPrice.toFixed(2)}`,
            status: o.status
        }));

        res.json({
            products,
            users,
            orders
        });
    } catch (error) {
        console.error("ADMIN GLOBAL SEARCH ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/notifications - Get live system notifications
router.get("/notifications", async (req, res) => {
    try {
        const latestOrders = await Order.find().sort({ createdAt: -1 }).limit(5);
        const latestUsers = await User.find().sort({ createdAt: -1 }).limit(5);

        const notifications = [];

        latestOrders.forEach(o => {
            notifications.push({
                id: `order-${o._id}`,
                type: "order",
                text: `New order #ORD-${o._id.toString().slice(-6).toUpperCase()} placed by ${o.shippingAddress?.fullName || "Customer"}`,
                amount: `$${o.totalPrice.toFixed(2)}`,
                time: o.createdAt,
                link: `/orders`
            });
        });

        latestUsers.forEach(u => {
            notifications.push({
                id: `user-${u._id}`,
                type: "user",
                text: `New user registered: ${u.name}`,
                time: u.createdAt,
                link: `/users`
            });
        });

        // Sort by date descending
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json(notifications.slice(0, 8));
    } catch (error) {
        console.error("ADMIN NOTIFICATIONS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// ========== REVIEW MODERATION ==========

// GET /api/admin/reviews - Fetch all reviews
router.get("/reviews", async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate("user", "name email")
            .populate("product", "title")
            .sort({ createdAt: -1 });

        const mapped = reviews.map((r) => ({
            id: r._id,
            author: r.user?.name || "Unknown User",
            email: r.user?.email || "",
            rating: r.rating,
            title: r.title || "",
            comment: r.comment,
            product: r.product?.title || "Unknown Product",
            productId: r.product?._id,
            date: r.createdAt
                ? new Date(r.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                  })
                : "N/A",
            status: r.status,
        }));

        res.json(mapped);
    } catch (error) {
        console.error("ADMIN GET REVIEWS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/admin/reviews/:id/approve - Approve a review
router.put("/reviews/:id/approve", async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        review.status = "Approved";
        await review.save();

        // Recalculate product rating after approval
        const stats = await Review.aggregate([
            { $match: { product: review.product, status: "Approved" } },
            {
                $group: {
                    _id: "$product",
                    averageRating: { $avg: "$rating" },
                    numReviews: { $sum: 1 },
                },
            },
        ]);

        if (stats.length > 0) {
            await Product.findByIdAndUpdate(review.product, {
                averageRating: Math.round(stats[0].averageRating * 10) / 10,
                numReviews: stats[0].numReviews,
            });
        }

        res.json({ message: "Review approved successfully" });
    } catch (error) {
        console.error("ADMIN APPROVE REVIEW ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/admin/reviews/:id - Delete a review
router.delete("/reviews/:id", async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        const productId = review.product;
        await Review.findByIdAndDelete(req.params.id);

        // Recalculate product rating after deletion
        const stats = await Review.aggregate([
            { $match: { product: productId, status: "Approved" } },
            {
                $group: {
                    _id: "$product",
                    averageRating: { $avg: "$rating" },
                    numReviews: { $sum: 1 },
                },
            },
        ]);

        if (stats.length > 0) {
            await Product.findByIdAndUpdate(productId, {
                averageRating: Math.round(stats[0].averageRating * 10) / 10,
                numReviews: stats[0].numReviews,
            });
        } else {
            await Product.findByIdAndUpdate(productId, {
                averageRating: 0,
                numReviews: 0,
            });
        }

        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        console.error("ADMIN DELETE REVIEW ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
