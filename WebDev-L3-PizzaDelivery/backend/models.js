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
  // Automatic use for stock-only items (packaging etc.), taken from stock whenever an order is placed:
  usePerPizza: { type: Number, default: 0 },      // e.g. 1 pizza box per pizza
  forSize: { type: String, default: "" },         // "" = every size, or a size key from sizes.js (R, L, F)
  usePerOrder: { type: Number, default: 0 },      // e.g. 1 carry bag per order
  active: { type: Boolean, default: true },       // false = hidden from customers, kept for history
  alerted: { type: Boolean, default: false },
}));

const Order = mongoose.model("Order", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  pizzas: [{ name: String, size: String, sizeLabel: String, base: String, sauce: String, cheese: String, veggies: [String], price: Number }],
  usage: [{ item: Schema.Types.ObjectId, qty: Number, soft: Boolean }],
  delivery: { country: String, area: String, address: String, phone: String, note: String },
  total: Number,
  status: { type: String, default: "Pending Payment" },
  paid: { type: Boolean, default: false },
  held: { type: Boolean, default: false },        // true while the order's stock is reserved but unpaid
  reservedUntil: Date,                            // when an unpaid reservation is released
  stripeSession: String,
  cancelledAt: Date,
  cancelNote: String,
  cancelledBy: String,                            // "customer" or "admin"
  cancelReason: String,                           // reason chosen by the customer
  refundError: String,                            // set when an automatic refund failed (admin must refund by hand)
  refundId: String,
  refundedAt: Date,
}, { timestamps: true }));

// A customer's review of one pizza from one DELIVERED order (one review per order line).
const Review = mongoose.model("Review", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true },
  userName: String,
  order: { type: Schema.Types.ObjectId, ref: "Order", index: true },
  line: Number,                                   // index of the pizza inside order.pizzas
  pizza: { type: String, index: true },           // menu pizza name, e.g. "Margherita"
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String, default: "" },
}, { timestamps: true }));
Review.schema.index({ order: 1, line: 1 }, { unique: true });

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
    enum: ["delivery", "wastage", "correction", "other", "order", "order-released", "order-cancelled", "new-item"],
  },
  note: { type: String, default: "" },
  by: String,
  order: { type: Schema.Types.ObjectId, ref: "Order" },
}, { timestamps: { createdAt: true, updatedAt: false } }));

module.exports = { User, Inventory, Order, Review, StockLog, ITEM_TYPES, CUSTOMER_TYPES, STOCK_ONLY_TYPES };