const router = require("express").Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { User, Inventory, Order, StockLog, ITEM_TYPES, STOCK_ONLY_TYPES } = require("../models");
const { sign, auth, adminOnly } = require("../auth");
const { checkLowStock } = require("../jobs");
const { adjust, levelOf, cancelPaidOrder, shortId } = require("../stock");
const { usedByMenu } = require("../varieties");
const { SIZES } = require("../sizes");
const { failLimiter } = require("../rateLimit");
const { getStripe } = require("../jobs");

// 8 wrong passwords from one address and it is locked out for 15 minutes.
const loginLimit = failLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

router.post("/login", async (req, res) => {
  try {
    const key = req.ip || "unknown";
    const wait = loginLimit.check(key);
    if (wait) {
      res.set("Retry-After", String(wait));
      return res.status(429).json({ error: "Too many failed attempts. Try again in " + Math.ceil(wait / 60) + " minute(s)." });
    }
    const { email, password } = req.body || {};
    const u = await User.findOne({ email: String(email || "").toLowerCase(), role: "admin" });
    if (!u || !(await bcrypt.compare(String(password || ""), u.password))) {
      loginLimit.fail(key);
      return res.status(401).json({ error: "Wrong admin credentials" });
    }
    loginLimit.reset(key);
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
  if (b.usePerPizza !== undefined) {
    const n = Number(b.usePerPizza === "" || b.usePerPizza === null ? 0 : b.usePerPizza);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Use per pizza must be a whole number from 0 to 100");
    out.usePerPizza = n;
  }
  if (b.usePerOrder !== undefined) {
    const n = Number(b.usePerOrder === "" || b.usePerOrder === null ? 0 : b.usePerOrder);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Use per order must be a whole number from 0 to 100");
    out.usePerOrder = n;
  }
  if (b.forSize !== undefined) {
    const k = String(b.forSize || "");
    if (k && !SIZES.some((s) => s.key === k)) throw new Error("Unknown pizza size");
    out.forSize = k;
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
    else { delete out.usePerPizza; delete out.usePerOrder; delete out.forSize; }
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
    else { delete out.usePerPizza; delete out.usePerOrder; delete out.forSize; }
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
  if (!okId(req.params.id)) return bad(res, "Bad order id");
  if (!["Order Received", "In Kitchen", "Sent to Delivery"].includes(status))
    return res.status(400).json({ error: "Bad status" });
  // A cancelled order stays cancelled.
  const o = await Order.findOneAndUpdate({ _id: req.params.id, paid: true, status: { $ne: "Cancelled" } }, { status }, { new: true });
  if (!o) return bad(res, "That order is cancelled or not found");
  res.json(o);
});

// Cancel a paid order. Body: { restock: true/false, refund: true/false, note }
// restock puts its ingredients and packaging back in stock; refund returns the money through Stripe.
router.post("/orders/:id/cancel", async (req, res) => {
  try {
    if (!okId(req.params.id)) return bad(res, "Bad order id");
    const b = req.body || {};
    const cur = await Order.findById(req.params.id);
    if (!cur || !cur.paid) return res.status(404).json({ error: "Order not found" });
    if (cur.status === "Cancelled") return bad(res, "This order is already cancelled");
    const order = await cancelPaidOrder(cur._id, { restock: !!b.restock, note: b.note, by: req.adminEmail });
    if (!order) return bad(res, "This order is already cancelled");

    let refundError = "";
    if (b.refund && !order.refundId) {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(order.stripeSession);
        if (!session.payment_intent) throw new Error("No payment found for this order");
        const refund = await stripe.refunds.create({ payment_intent: session.payment_intent }, { idempotencyKey: "refund-" + order._id });
        order.refundId = refund.id;
        order.refundedAt = new Date();
        await order.save();
      } catch (e) {
        refundError = e.message;
      }
    }
    checkLowStock().catch(() => {});
    res.json({ order, refundError });
  } catch (e) {
    bad(res, e.message);
  }
});

// ---- Reports -------------------------------------------------------------------------------

const daysParam = (q) => Math.min(Math.max(parseInt(q.days) || 30, 1), 365);

async function buildReport(days) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const [moves, items, sales, pizzas, cancelled] = await Promise.all([
    StockLog.aggregate([
      { $match: { createdAt: { $gte: since }, item: { $ne: null } } },
      { $group: { _id: { item: "$item", reason: "$reason" }, qty: { $sum: "$change" } } },
    ]),
    Inventory.find().sort({ type: 1, name: 1 }),
    Order.aggregate([
      { $match: { paid: true, status: { $ne: "Cancelled" }, createdAt: { $gte: since } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
    ]),
    Order.aggregate([
      { $match: { paid: true, status: { $ne: "Cancelled" }, createdAt: { $gte: since } } },
      { $unwind: "$pizzas" },
      { $group: { _id: { name: "$pizzas.name", size: { $ifNull: ["$pizzas.sizeLabel", "Regular"] } }, count: { $sum: 1 }, revenue: { $sum: "$pizzas.price" } } },
      { $sort: { count: -1 } },
    ]),
    Order.countDocuments({ paid: true, status: "Cancelled", createdAt: { $gte: since } }),
  ]);

  const by = {};
  for (const m of moves) {
    const id = String(m._id.item);
    (by[id] = by[id] || {})[m._id.reason] = m.qty;
  }
  const g = (o, k) => (o && o[k]) || 0;
  const rows = items.map((it) => {
    const m = by[String(it._id)] || {};
    const used = -(g(m, "order") + g(m, "order-released") + g(m, "order-cancelled"));
    const perDay = used / days;
    return {
      id: it._id, name: it.name, type: it.type, unit: it.unit || "pcs", stock: it.stock,
      used,                                           // taken by paid/held orders, net of released and cancelled
      wasted: -g(m, "wastage"),
      delivered: g(m, "delivery") + g(m, "new-item"),
      corrected: g(m, "correction") + g(m, "other"),
      perDay: Math.round(perDay * 10) / 10,
      daysLeft: perDay > 0 ? Math.floor(it.stock / perDay) : null,
    };
  });
  return {
    days, since,
    orders: (sales[0] && sales[0].orders) || 0,
    revenue: Math.round(((sales[0] && sales[0].revenue) || 0) * 100) / 100,
    cancelled,
    pizzas: pizzas.map((p) => ({ name: p._id.name, size: p._id.size, count: p.count, revenue: Math.round(p.revenue * 100) / 100 })),
    items: rows,
  };
}

// CSV text with a byte-order mark so Excel reads it as UTF-8. Text starting with = + - @ is
// prefixed with ' so a spreadsheet can never run it as a formula.
const cell = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (head, rows) => "\uFEFF" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const sendCsv = (res, name, text) => {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="' + name + '"');
  res.send(text);
};

router.get("/report", async (req, res) => {
  try {
    res.json(await buildReport(daysParam(req.query)));
  } catch (e) {
    res.status(500).json({ error: "Could not build the report" });
  }
});

router.get("/report.csv", async (req, res) => {
  try {
    const r = await buildReport(daysParam(req.query));
    const head = ["Item", "Category", "Unit", "In stock now", "Used by orders", "Wasted", "Delivered / added", "Corrections", "Used per day", "Days left"];
    const rows = r.items.map((i) => [i.name, i.type, i.unit, i.stock, i.used, i.wasted, i.delivered, i.corrected, i.perDay, i.daysLeft]);
    sendCsv(res, "stock-report-" + r.days + "days.csv", toCsv(head, rows));
  } catch (e) {
    res.status(500).json({ error: "Could not build the report" });
  }
});

router.get("/stock-log.csv", async (req, res) => {
  try {
    const since = new Date(Date.now() - daysParam(req.query) * 24 * 3600 * 1000);
    const logs = await StockLog.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(5000);
    const head = ["Date", "Item", "Category", "Change", "Before", "After", "Reason", "Note", "By", "Order"];
    const rows = logs.map((l) => [l.createdAt, l.itemName, l.itemType, l.change, l.before, l.after, l.reason, l.note, l.by, l.order ? shortId(l.order) : ""]);
    sendCsv(res, "stock-log.csv", toCsv(head, rows));
  } catch (e) {
    res.status(500).json({ error: "Could not export the log" });
  }
});

module.exports = router;
