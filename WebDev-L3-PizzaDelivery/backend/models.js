const mongoose = require("mongoose");
const { Schema } = mongoose;

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
  type: { type: String, enum: ["base", "sauce", "cheese", "veggie"] },
  name: String,
  price: Number,
  stock: Number,
  alerted: { type: Boolean, default: false },
}));

const Order = mongoose.model("Order", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  pizzas: [{ name: String, base: String, sauce: String, cheese: String, veggies: [String], price: Number }],
  usage: [{ item: Schema.Types.ObjectId, qty: Number }],
  total: Number,
  status: { type: String, default: "Pending Payment" },
  paid: { type: Boolean, default: false },
  stripeSession: String,
}, { timestamps: true }));

module.exports = { User, Inventory, Order };