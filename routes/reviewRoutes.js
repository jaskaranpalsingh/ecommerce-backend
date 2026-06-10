const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");

// Helper: Recalculate product's average rating and review count
async function recalcProductRating(productId) {
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
}

// GET /api/reviews/:productId — Get all approved reviews for a product
router.get("/:productId", async (req, res) => {
    try {
        const reviews = await Review.find({
            product: req.params.productId,
            status: "Approved",
        })
            .populate("user", "name")
            .sort({ createdAt: -1 });

        // Build star breakdown
        const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let totalRating = 0;

        reviews.forEach((r) => {
            breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
            totalRating += r.rating;
        });

        const averageRating =
            reviews.length > 0
                ? Math.round((totalRating / reviews.length) * 10) / 10
                : 0;

        res.json({
            reviews,
            averageRating,
            totalReviews: reviews.length,
            breakdown,
        });
    } catch (error) {
        console.error("GET REVIEWS ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/reviews/:productId — Submit a review (auth required)
router.post("/:productId", protect, async (req, res) => {
    try {
        const { rating, title, comment } = req.body;

        if (!rating || !comment) {
            return res
                .status(400)
                .json({ message: "Rating and comment are required" });
        }

        if (rating < 1 || rating > 5) {
            return res
                .status(400)
                .json({ message: "Rating must be between 1 and 5" });
        }

        // Check if product exists
        const product = await Product.findById(req.params.productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({
            user: req.user._id,
            product: req.params.productId,
        });

        if (existingReview) {
            return res
                .status(400)
                .json({ message: "You have already reviewed this product" });
        }

        const review = new Review({
            user: req.user._id,
            product: req.params.productId,
            rating: Number(rating),
            title: title || "",
            comment,
        });

        await review.save();

        // Recalculate product rating
        await recalcProductRating(product._id);

        // Populate user name for the response
        await review.populate("user", "name");

        res.status(201).json({
            message: "Review submitted successfully",
            review,
        });
    } catch (error) {
        // Handle duplicate key error (user already reviewed)
        if (error.code === 11000) {
            return res
                .status(400)
                .json({ message: "You have already reviewed this product" });
        }
        console.error("POST REVIEW ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/reviews/:id — Delete own review (auth required)
router.delete("/:id", protect, async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Only allow the review author to delete
        if (review.user.toString() !== req.user._id.toString()) {
            return res
                .status(403)
                .json({ message: "Not authorized to delete this review" });
        }

        const productId = review.product;
        await Review.findByIdAndDelete(req.params.id);

        // Recalculate product rating
        await recalcProductRating(productId);

        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        console.error("DELETE REVIEW ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
