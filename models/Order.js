const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        orderItems: [
            {
                title: { type: String, required: true },
                qty: { type: Number, required: true },
                price: { type: Number, required: true },
                image: { type: String },
            },
        ],
        shippingAddress: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            pincode: { type: String, required: true },
        },
        subtotal: { type: Number, required: true },
        shippingPrice: { type: Number, default: 0 },
        totalPrice: { type: Number, required: true },
        isPaid: { type: Boolean, default: false },
        isDelivered: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ["Processing", "Shipped", "Delivered", "Cancelled"],
            default: "Processing",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);