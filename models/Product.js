const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    title: String,
    price: Number,
    image: String,
    category: String,
    description: String,
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
});

module.exports = mongoose.model("Product", productSchema);