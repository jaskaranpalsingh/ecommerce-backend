const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

// @desc    Get user wishlist
// @route   GET /api/wishlist
// @access  Private
router.get("/", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate("wishlist");
        res.json(user.wishlist || []);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Toggle product in wishlist (Add/Remove)
// @route   POST /api/wishlist
// @access  Private
router.post("/", protect, async (req, res) => {
    const { productId } = req.body;
    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user.wishlist) {
            user.wishlist = [];
        }

        const isWishlisted = user.wishlist.some(id => id.toString() === productId.toString());

        if (isWishlisted) {
            // Remove from wishlist
            user.wishlist = user.wishlist.filter(id => id.toString() !== productId.toString());
            await user.save();
            const populatedUser = await User.findById(req.user._id).populate("wishlist");
            return res.json({ 
                message: "Product removed from wishlist", 
                wishlist: populatedUser.wishlist || [] 
            });
        } else {
            // Add to wishlist
            user.wishlist.push(productId);
            await user.save();
            const populatedUser = await User.findById(req.user._id).populate("wishlist");
            return res.json({ 
                message: "Product added to wishlist", 
                wishlist: populatedUser.wishlist || [] 
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Remove product from wishlist
// @route   DELETE /api/wishlist/:productId
// @access  Private
router.delete("/:productId", protect, async (req, res) => {
    const { productId } = req.params;
    try {
        const user = await User.findById(req.user._id);
        if (user.wishlist) {
            user.wishlist = user.wishlist.filter(id => id.toString() !== productId.toString());
            await user.save();
        }
        const populatedUser = await User.findById(req.user._id).populate("wishlist");
        res.json({ 
            message: "Product removed from wishlist", 
            wishlist: populatedUser.wishlist || [] 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
