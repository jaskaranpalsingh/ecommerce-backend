const express = require("express");

const router = express.Router();

const Product = require("../models/Product");


// GET ALL PRODUCTS
router.get("/", async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// ADD PRODUCT
router.post("/", async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        console.log(product);
        res.json({ message: "Product Added Successfully", product });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// UPDATE PRODUCT (PUT /api/products/:id)
router.put("/:id", async (req, res) => {
    try {
        const updated = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.json({ message: "Product Updated Successfully", product: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// DELETE PRODUCT (DELETE /api/products/:id)
router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.json({ message: "Product Deleted Successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


module.exports = router;