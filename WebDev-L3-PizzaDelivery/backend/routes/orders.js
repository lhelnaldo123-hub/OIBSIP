const router = require("express").Router();
const { Inventory, Order, User } = require("../models");
const { auth } = require("../auth");
const { checkLowStock } = require("../jobs");

const getStripe = () => require("stripe")(process.env.STRIPE_SECRET_KEY);
const front = () => (process.env.FRONTEND_URL || "").replace(/\/$/, "");
const money = (n) => Math.round(n * 100) / 100;
const PRICE_BASE = 4;

const VARIETIES = [
  { name: "Margherita", desc: "Classic tomato and mozzarella", base: "Thin Crust", sauce: "Tomato Basil", cheese: "Mozzarella", veggies: ["Tomato"] },
  { name: "Farmhouse", desc: "Loaded with fresh vegetables", base: "Thick Crust", sauce: "Tomato Basil", cheese: "Mozzarella", veggies: ["Mushroom", "Onion", "Bell Pepper", "Sweetcorn"] },
  { name: "BBQ Veggie", desc: "Smoky barbecue and cheddar", base: "Whole Wheat", sauce: "BBQ", cheese: "Cheddar", veggies: ["Onion", "Bell Pepper", "Sweetcorn"] },
  { name: "Pesto Delight", desc: "Green pesto on a cheese burst base", base: "Cheese Burst", sauce: "Pesto", cheese: "Mozzarella", veggies: ["Olives", "Tomato", "Mushroom"] },
  { name: "Spicy Garden", desc: "Hot arrabbiata with crunchy veg", base: "Thin Crust", sauce: "Spicy Arrabbiata", cheese: "Cheddar", veggies: ["Bell Pepper", "Olives", "Onion"] },
];

router.get("/options", async (req, res) => {
  try {
    const items = await Inventory.find().sort({ name: 1 });
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
      };
    }).filter(Boolean);
    res.json({ base: group("base"), sauce: group("sauce"), cheese: group("cheese"), veggie: group("veggie"), varieties });
  } catch (e) {
    res.status(500).json({ error: "Could not load menu" });
  }
});

async function priceOrder(pizzas) {
  if (!Array.isArray(pizzas) || pizzas.length === 0 || pizzas.length > 10) throw new Error("Cart is empty or too large");
  const lines = [], used = {}, names = {};
  let total = 0;
  for (const p of pizzas) {
    const veg = [...new Set((Array.isArray(p.veggies) ? p.veggies : []).map(String))];
    const items = await Inventory.find({ _id: { $in: [p.base, p.sauce, p.cheese, ...veg] } });
    const get = (id, type) => items.find((i) => String(i._id) === String(id) && i.type === type);
    const base = get(p.base, "base"), sauce = get(p.sauce, "sauce"), cheese = get(p.cheese, "cheese");
    const vs = veg.map((id) => get(id, "veggie"));
    if (!base || !sauce || !cheese || vs.some((v) => !v)) throw new Error("Invalid pizza choice");
    const picked = [base, sauce, cheese, ...vs];
    picked.forEach((i) => { used[i._id] = (used[i._id] || 0) + 1; names[i._id] = i; });
    const price = money(PRICE_BASE + picked.reduce((a, i) => a + i.price, 0));
    total += price;
    lines.push({
      name: String(p.name || "Custom Pizza").slice(0, 40),
      base: base.name, sauce: sauce.name, cheese: cheese.name,
      veggies: vs.map((v) => v.name), price,
    });
  }
  const usage = [];
  for (const id of Object.keys(used)) {
    if (names[id].stock < used[id]) throw new Error("Sorry, not enough " + names[id].name + " in stock");
    usage.push({ item: id, qty: used[id] });
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

router.post("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.verified) return res.status(403).json({ error: "Verify your email first" });
    const delivery = cleanDelivery((req.body || {}).delivery);
    const { lines, total, usage } = await priceOrder((req.body || {}).pizzas);
    const order = await Order.create({ user: user._id, pizzas: lines, usage, delivery, total });
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
      success_url: `${front()}/?paid=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${front()}/?cancelled=1`,
      metadata: { orderId: String(order._id) },
    });
    order.stripeSession = session.id;
    await order.save();
    res.status(201).json({ url: session.url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/confirm", auth, async (req, res) => {
  try {
    const { orderId, sessionId } = req.body || {};
    const order = await Order.findOne({ _id: orderId, user: req.user.id });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.paid) return res.json({ status: order.status });
    if (order.stripeSession !== sessionId) return res.status(400).json({ error: "Payment session mismatch" });
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return res.status(400).json({ error: "Payment not completed" });
    const done = await Order.findOneAndUpdate(
      { _id: order._id, paid: false },
      { paid: true, status: "Order Received" },
      { new: true }
    );
    if (done) {
      for (const u of order.usage) await Inventory.updateOne({ _id: u.item }, { $inc: { stock: -u.qty } });
      checkLowStock().catch(() => {});
    }
    res.json({ status: "Order Received" });
  } catch (e) {
    res.status(400).json({ error: e.message });
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