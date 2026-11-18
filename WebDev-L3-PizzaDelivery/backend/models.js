const mongoose = require("mongoose");
const { Schema } = mongoose;

// Customer-facing types (shown in the pizza builder) and stock-only types.
const CUSTOMER_TYPES = ["base", "sauce", "cheese", "veggie"];
const STOCK_ONLY_TYPES = ["packaging", "drink", "side", "supply", "other"];
const ITEM_TYPES = [...CUSTOMER_TYPES, ...STOCK_ONLY_TYPES];

const User = mongoose.model("User", new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true, trim: true },
  password: String,
  role: { type: String, default: "user" },
  verified: { type: Boolean, default: false },
  verifyToken: String,
  resetToken: String,
  resetExpires: Date,
}, { timestamps: true }));

const Inventory = mongoose.model("Inventory", new Schema({
  type: { type: String, enum: ITEM_TYPES },
  name: String,
  price: Number,                                  // add-on price for customers (0 for stock-only items)
  stock: Number,
  unit: { type: String, default: "pcs" },         // pcs, kg, litres, boxes ...
  reorderLevel: Number,                           // empty = use LOW_STOCK_THRESHOLD (default 20)
  supplier: { type: String, default: "" },
  expiry: Date,                                   // optional best-before date
  active: { type: Boolean, default: true },       // false = hidden from customers, kept for history
  alerted: { type: Boolean, default: false },
}));

const Order = mongoose.model("Order", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  pizzas: [{ name: String, base: String, sauce: String, cheese: String, veggies: [String], price: Number }],
  usage: [{ item: Schema.Types.ObjectId, qty: Number }],
  delivery: { country: String, area: String, address: String, phone: String, note: String },
  total: Number,
  status: { type: String, default: "Pending Payment" },
  paid: { type: Boolean, default: false },
  held: { type: Boolean, default: false },        // true while the order's stock is reserved but unpaid
  reservedUntil: Date,                            // when an unpaid reservation is released
  stripeSession: String,
}, { timestamps: true }));

// One row per stock movement: who, when, how much, before/after and why.
const StockLog = mongoose.model("StockLog", new Schema({
  item: { type: Schema.Types.ObjectId, ref: "Inventory", index: true },
  itemName: String,
  itemType: String,
  change: Number,
  before: Number,
  after: Number,
  reason: {
    type: String,
    enum: ["delivery", "wastage", "correction", "other", "order", "order-released", "new-item"],
  },
  note: { type: String, default: "" },
  by: String,
  order: { type: Schema.Types.ObjectId, ref: "Order" },
}, { timestamps: { createdAt: true, updatedAt: false } }));

module.exports = { User, Inventory, Order, StockLog, ITEM_TYPES, CUSTOMER_TYPES, STOCK_ONLY_TYPES };
