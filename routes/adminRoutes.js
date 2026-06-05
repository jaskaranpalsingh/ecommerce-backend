const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

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

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        order.status = status;
        await order.save();

        res.json({ message: "Order status updated successfully", order });
    } catch (error) {
        console.error("ADMIN UPDATE ORDER STATUS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;

