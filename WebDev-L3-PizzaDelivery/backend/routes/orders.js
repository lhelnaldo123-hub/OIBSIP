const router = require("express").Router();
const { Inventory, Order, User } = require("../models");
const { auth } = require("../auth");
const { checkLowStock, getStripe } = require("../jobs");
const { reserve, releaseOrder, finalizePaid } = require("../stock");
const { VARIETIES } = require("../varieties");
const { SIZES, sizeOf } = require("../sizes");
const { STOCK_ONLY_TYPES } = require("../models");

const front = () => (process.env.FRONTEND_URL || "").replace(/\/$/, "");
const money = (n) => Math.round(n * 100) / 100;
const PRICE_BASE = 4;
const HOLD_MINUTES = 31; // Stripe needs a checkout session to live at least 30 minutes

router.get("/options", async (req, res) => {
  try {
    const items = await Inventory.find({ active: { $ne: false } }).sort({ name: 1 });
    const find = (type, name) => items.find((i) => i.type === type && i.name === name);
    const group = (type) =>
      items.filter((i) => i.type === type).map((i) => ({ id: i._id, name: i.name, price: i.price, stock: i.stock }));
    const varieties = VARIETIES.map((v) => {
      const b = find("base", v.base), s = find("sauce", v.sauce), c = find("cheese", v.cheese);
      const vs = v.veggies.map((n) => find("veggie", n));
      if (!b || !s || !c || vs.some((x) => !x)) return null;
      return {
        name: v.name, desc: v.desc,
        base: b._id, sauce: s._id, cheese: c._id, veggies: vs.map((x) => x._id),
        labels: [v.base, v.sauce, v.cheese, ...v.veggies].join(", "),
        price: money(PRICE_BASE + b.price + s.price + c.price + vs.reduce((a, x) => a + x.price, 0)),
        soldOut: [b, s, c, ...vs].some((x) => x.stock <= 0),
        minStock: Math.min(...[b, s, c, ...vs].map((x) => x.stock)),
      };
    }).filter(Boolean);
    res.json({ base: group("base"), sauce: group("sauce"), cheese: group("cheese"), veggie: group("veggie"), varieties, sizes: SIZES.map(({ key, label, mult, portions }) => ({ key, label, mult, portions })) });
  } catch (e) {
    res.status(500).json({ error: "Could not load menu" });
  }
});

async function priceOrder(pizzas) {
  if (!Array.isArray(pizzas) || pizzas.length === 0 || pizzas.length > 10) throw new Error("Cart is empty or too large");
  const lines = [], used = {}, names = {}, sizesUsed = [];
  let total = 0;
  for (const p of pizzas) {
    const size = sizeOf(p.size);
    if (!size) throw new Error("Invalid pizza size");
    sizesUsed.push(size.key);
    const veg = [...new Set((Array.isArray(p.veggies) ? p.veggies : []).map(String))];
    const items = await Inventory.find({ _id: { $in: [p.base, p.sauce, p.cheese, ...veg] }, active: { $ne: false } });
    const get = (id, type) => items.find((i) => String(i._id) === String(id) && i.type === type);
    const base = get(p.base, "base"), sauce = get(p.sauce, "sauce"), cheese = get(p.cheese, "cheese");
    const vs = veg.map((id) => get(id, "veggie"));
    if (!base || !sauce || !cheese || vs.some((v) => !v)) throw new Error("Invalid pizza choice");
    const picked = [base, sauce, cheese, ...vs];
    picked.forEach((i) => { used[i._id] = (used[i._id] || 0) + size.portions; names[i._id] = i; });
    const price = money(money(PRICE_BASE + picked.reduce((a, i) => a + i.price, 0)) * size.mult);
    total += price;
    lines.push({
      name: String(p.name || "Custom Pizza").slice(0, 40),
      size: size.key, sizeLabel: size.label,
      base: base.name, sauce: sauce.name, cheese: cheese.name,
      veggies: vs.map((v) => v.name), price,
    });
  }
  const usage = [];
  for (const id of Object.keys(used)) {
    if (names[id].stock < used[id]) throw new Error("Sorry, not enough " + names[id].name + " in stock");
    usage.push({ item: id, qty: used[id] });
  }
  // Packaging and other stock-only items the admin set to be used automatically.
  // These are "soft": taken as far as stock allows, and they never stop a sale.
  const auto = await Inventory.find({ type: { $in: STOCK_ONLY_TYPES }, $or: [{ usePerPizza: { $gt: 0 } }, { usePerOrder: { $gt: 0 } }] });
  for (const it of auto) {
    const perPizza = sizesUsed.filter((k) => !it.forSize || it.forSize === k).length * (it.usePerPizza || 0);
    const qty = perPizza + (it.usePerOrder || 0);
    if (qty > 0) usage.push({ item: it._id, qty, soft: true });
  }
  return { lines, total: money(total), usage };
}

function cleanDelivery(d) {
  d = d || {};
  const country = String(d.country || "").trim().slice(0, 60);
  const area = String(d.area || "").trim().slice(0, 80);
  const address = String(d.address || "").trim().slice(0, 200);
  const phone = String(d.phone || "").trim().slice(0, 25);
  const note = String(d.note || "").trim().slice(0, 200);
  if (!country) throw new Error("Please choose your country");
  if (area.length < 2) throw new Error("Please enter your city or area");
  if (address.length < 5) throw new Error("Please write your street address or landmark");
  if (phone.replace(/\D/g, "").length < 7) throw new Error("Please enter a phone number we can call");
  return { country, area, address, phone, note };
}

// Creating an order takes the stock straight away (a 31 minute hold), so two
// customers can never buy the last unit. If the order is not paid in time,
// the reconcile job in jobs.js gives the stock back.
router.post("/", auth, async (req, res) => {
  let order = null;
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.verified) return res.status(403).json({ error: "Verify your email first" });
    const delivery = cleanDelivery((req.body || {}).delivery);
    const { lines, total, usage } = await priceOrder((req.body || {}).pizzas);
    const expiresAt = Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60;

    order = await Order.create({
      user: user._id, pizzas: lines, usage, delivery, total,
      held: true, reservedUntil: new Date(expiresAt * 1000),
    });
    let taken;
    try {
      taken = await reserve(usage, order);
    } catch (e) {
      await Order.deleteOne({ _id: order._id });
      order = null;
      throw e;
    }
    // Save what was really taken (packaging may have been short) before talking to Stripe.
    order.usage = taken;
    await order.save();

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: process.env.CURRENCY || "usd",
          product_data: { name: `Pizza order (${lines.length} pizza${lines.length > 1 ? "s" : ""})` },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      expires_at: expiresAt,
      success_url: `${front()}/?paid=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${front()}/?cancelled=${order._id}`,
      metadata: { orderId: String(order._id) },
    });
    order.stripeSession = session.id;
    await order.save();
    res.status(201).json({ url: session.url });
  } catch (e) {
    if (order) await releaseOrder(order._id).catch(() => {});
    res.status(400).json({ error: e.message });
  }
});

router.post("/confirm", auth, async (req, res) => {
  try {
    const { orderId, sessionId } = req.body || {};
    const order = await Order.findOne({ _id: orderId, user: req.user.id });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.paid) return res.json({ status: order.status });
    if (order.status === "Expired")
      return res.status(400).json({ error: "This order expired before payment. If you were charged, please contact us." });
    if (order.stripeSession !== sessionId) return res.status(400).json({ error: "Payment session mismatch" });
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return res.status(400).json({ error: "Payment not completed" });

    // Orders created before stock holds existed still need their stock taken now (never below zero).
    const legacy = !order.held && order.status === "Pending Payment";
    const done = await finalizePaid(order._id);
    if (done) {
      if (legacy) {
        for (const u of order.usage)
          await Inventory.updateOne({ _id: u.item }, [{ $set: { stock: { $max: [0, { $subtract: ["$stock", u.qty] }] } } }]);
      }
      checkLowStock().catch(() => {});
    }
    res.json({ status: "Order Received" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// The customer pressed "back" on the Stripe page: give the held stock back right away.
router.post("/cancel", auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: (req.body || {}).orderId, user: req.user.id });
    if (!order || order.paid || !order.held) return res.json({ released: false });
    if (order.stripeSession) {
      try {
        await getStripe().checkout.sessions.expire(order.stripeSession);
      } catch (e) {
        return res.json({ released: false }); // already paid or already closed; the reconcile job settles it
      }
    }
    res.json({ released: await releaseOrder(order._id) });
  } catch (e) {
    res.json({ released: false });
  }
});

router.get("/mine", auth, async (req, res) => {
  try {
    res.json(await Order.find({ user: req.user.id, paid: true }).sort({ createdAt: -1 }).limit(30));
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
