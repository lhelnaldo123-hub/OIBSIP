const router = require("express").Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { User, Inventory, Order, StockLog, ITEM_TYPES, STOCK_ONLY_TYPES } = require("../models");
const { sign, auth, adminOnly } = require("../auth");
const { checkLowStock } = require("../jobs");
const { adjust, levelOf } = require("../stock");
const { usedByMenu } = require("../varieties");

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

// Re-check the role in the database and remember who is making changes (for the stock log).
router.use(async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id).select("email role");
    if (!u || u.role !== "admin") return res.status(403).json({ error: "Admins only" });
    req.adminEmail = u.email;
    next();
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

const bad = (res, msg) => res.status(400).json({ error: msg });
const okId = (id) => mongoose.isValidObjectId(id);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameName = (name) => new RegExp("^" + escapeRe(name) + "$", "i");

// What the admin screen receives: reorderLevel is always filled in (own value or shop default),
// so the browser never needs its own copy of the threshold.
const view = (doc) => {
  const o = doc.toObject ? doc.toObject() : doc;
  return { ...o, reorderCustom: o.reorderLevel !== undefined && o.reorderLevel !== null, reorderLevel: levelOf(o) };
};

// Checks the fields the admin form can send. Throws a readable message on bad input.
function cleanFields(b, creating) {
  const out = {}, unset = {};
  if (creating || b.name !== undefined) {
    const name = String(b.name || "").trim();
    if (name.length < 2 || name.length > 60) throw new Error("Name must be 2 to 60 characters");
    out.name = name;
  }
  if (creating || b.price !== undefined) {
    const p = Number(b.price === "" || b.price === null || b.price === undefined ? 0 : b.price);
    if (!isFinite(p) || p < 0 || p > 1000) throw new Error("Price must be a number from 0 to 1000");
    out.price = Math.round(p * 100) / 100;
  }
  if (creating || b.unit !== undefined) out.unit = String(b.unit || "").trim().slice(0, 12) || "pcs";
  if (b.supplier !== undefined) out.supplier = String(b.supplier || "").trim().slice(0, 80);
  if (b.reorderLevel !== undefined) {
    if (b.reorderLevel === "" || b.reorderLevel === null) unset.reorderLevel = 1;
    else {
      const n = Number(b.reorderLevel);
      if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new Error("Reorder level must be a whole number, 0 or more");
      out.reorderLevel = n;
    }
  }
  if (b.expiry !== undefined) {
    if (!b.expiry) unset.expiry = 1;
    else {
      const d = new Date(b.expiry);
      if (isNaN(d.getTime())) throw new Error("That expiry date is not valid");
      out.expiry = d;
    }
  }
  if (b.active !== undefined) out.active = !!b.active;
  return { out, unset };
}

router.get("/inventory", async (req, res) => {
  const items = await Inventory.find().sort({ type: 1, name: 1 });
  res.json(items.map(view));
});

// Add a new item.
router.post("/inventory", async (req, res) => {
  try {
    const b = req.body || {};
    if (!ITEM_TYPES.includes(b.type)) return bad(res, "Choose a category");
    const { out } = cleanFields(b, true);
    const stock = Number(b.stock === "" || b.stock === null || b.stock === undefined ? 0 : b.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return bad(res, "Starting stock must be a whole number, 0 or more");
    if (STOCK_ONLY_TYPES.includes(b.type)) out.price = 0;
    if (await Inventory.findOne({ type: b.type, name: sameName(out.name) })) return bad(res, "That item already exists in this category");
    const item = await Inventory.create({ ...out, type: b.type, stock });
    await StockLog.create({
      item: item._id, itemName: item.name, itemType: item.type,
      change: stock, before: 0, after: stock, reason: "new-item", note: "Item added", by: req.adminEmail,
    });
    checkLowStock().catch(() => {});
    res.status(201).json(view(item));
  } catch (e) {
    bad(res, e.message);
  }
});

// Edit details (not the stock count) or hide / show an item.
router.patch("/inventory/:id", async (req, res) => {
  try {
    if (!okId(req.params.id)) return bad(res, "Bad item id");
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    const { out, unset } = cleanFields(req.body || {}, false);
    if (out.name && out.name !== item.name) {
      if (usedByMenu(item.type, item.name)) return bad(res, item.name + " is used by a pizza on the menu, so it cannot be renamed");
      if (await Inventory.findOne({ _id: { $ne: item._id }, type: item.type, name: sameName(out.name) }))
        return bad(res, "That item already exists in this category");
    }
    if (STOCK_ONLY_TYPES.includes(item.type)) delete out.price;
    const update = {};
    if (Object.keys(out).length) update.$set = out;
    if (Object.keys(unset).length) update.$unset = unset;
    if (!Object.keys(update).length) return bad(res, "Nothing to change");
    let saved = await Inventory.findByIdAndUpdate(item._id, update, { new: true });
    if (saved.alerted && saved.stock >= levelOf(saved)) saved = await Inventory.findByIdAndUpdate(saved._id, { alerted: false }, { new: true });
    checkLowStock().catch(() => {});
    res.json(view(saved));
  } catch (e) {
    bad(res, e.message);
  }
});

// Add or remove stock, with a reason. This is the normal way to change a count.
const MANUAL_REASONS = ["delivery", "wastage", "correction", "other"];
router.post("/inventory/:id/adjust", async (req, res) => {
  try {
    if (!okId(req.params.id)) return bad(res, "Bad item id");
    const b = req.body || {};
    const change = Number(b.change);
    if (!Number.isInteger(change) || change === 0) return bad(res, "Enter a whole number such as 10 or -3");
    const reason = MANUAL_REASONS.includes(b.reason) ? b.reason : "other";
    if (reason === "delivery" && change < 0) return bad(res, "A delivery adds stock. Use a positive number, or pick another reason.");
    if (reason === "wastage" && change > 0) return bad(res, "Wastage removes stock. Use a negative number.");
    const item = await adjust(req.params.id, change, { reason, note: b.note, by: req.adminEmail });
    checkLowStock().catch(() => {});
    res.json(view(item));
  } catch (e) {
    bad(res, e.message);
  }
});

// Old "set the exact number" route, kept so nothing else breaks. It is logged as a correction.
router.put("/inventory/:id", async (req, res) => {
  try {
    if (!okId(req.params.id)) return bad(res, "Bad item id");
    const stock = Number(req.body.stock);
    if (!Number.isInteger(stock) || stock < 0) return bad(res, "Enter a whole number, 0 or more");
    const cur = await Inventory.findById(req.params.id);
    if (!cur) return res.status(404).json({ error: "Item not found" });
    if (stock === cur.stock) return res.json(view(cur));
    const item = await adjust(cur._id, stock - cur.stock, { reason: "correction", note: "Set to " + stock, by: req.adminEmail });
    checkLowStock().catch(() => {});
    res.json(view(item));
  } catch (e) {
    bad(res, e.message);
  }
});

// Recent stock movements, newest first. Optional ?item=<id>&limit=<n>.
router.get("/stock-log", async (req, res) => {
  try {
    const filter = {};
    if (req.query.item && okId(req.query.item)) filter.item = req.query.item;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 300);
    res.json(await StockLog.find(filter).sort({ createdAt: -1 }).limit(limit));
  } catch (e) {
    res.status(500).json({ error: "Server error" });
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
