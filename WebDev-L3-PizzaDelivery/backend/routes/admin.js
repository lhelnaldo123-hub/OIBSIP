const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { User, Inventory, Order } = require("../models");
const { sign, auth, adminOnly } = require("../auth");
const { checkLowStock, LIMIT } = require("../jobs");

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const u = await User.findOne({ email: String(email || "").toLowerCase(), role: "admin" });
    if (!u || !(await bcrypt.compare(String(password || ""), u.password)))
      return res.status(401).json({ error: "Wrong admin credentials" });
    res.json({ token: sign(u) });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.use(auth, adminOnly);

router.get("/inventory", async (req, res) => {
  res.json(await Inventory.find().sort({ type: 1, name: 1 }));
});

router.put("/inventory/:id", async (req, res) => {
  try {
    const stock = parseInt(req.body.stock);
    if (isNaN(stock) || stock < 0) return res.status(400).json({ error: "Enter a valid number" });
    const update = { stock };
    if (stock >= LIMIT()) update.alerted = false;
    const item = await Inventory.findByIdAndUpdate(req.params.id, update, { new: true });
    await checkLowStock();
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/orders", async (req, res) => {
  res.json(await Order.find({ paid: true }).populate("user", "name email").sort({ createdAt: -1 }).limit(50));
});

router.put("/orders/:id", async (req, res) => {
  const { status } = req.body || {};
  if (!["Order Received", "In Kitchen", "Sent to Delivery"].includes(status))
    return res.status(400).json({ error: "Bad status" });
  res.json(await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }));
});

module.exports = router;