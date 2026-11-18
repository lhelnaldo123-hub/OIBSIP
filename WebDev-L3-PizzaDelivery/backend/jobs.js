const bcrypt = require("bcryptjs");
const cron = require("node-cron");
const { User, Inventory, Order } = require("./models");
const { sendMail } = require("./mailer");
const { LIMIT, levelOf, releaseOrder, finalizePaid } = require("./stock");

const getStripe = () => require("stripe")(process.env.STRIPE_SECRET_KEY);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function seed() {
  if ((await Inventory.countDocuments()) === 0) {
    const mk = (type, list) => list.map(([name, price]) => ({ type, name, price, stock: 50, unit: "pcs" }));
    await Inventory.insertMany([
      ...mk("base", [["Thin Crust", 2], ["Thick Crust", 2.5], ["Cheese Burst", 3.5], ["Whole Wheat", 3], ["Gluten Free", 4]]),
      ...mk("sauce", [["Tomato Basil", 1], ["BBQ", 1.2], ["Pesto", 1.5], ["White Garlic", 1.2], ["Spicy Arrabbiata", 1]]),
      ...mk("cheese", [["Mozzarella", 2], ["Cheddar", 2], ["Vegan Cheese", 2.5]]),
      ...mk("veggie", [["Mushroom", 0.8], ["Onion", 0.5], ["Bell Pepper", 0.7], ["Olives", 0.8], ["Sweetcorn", 0.6], ["Tomato", 0.5]]),
    ]);
    console.log("Inventory seeded");
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await User.findOneAndUpdate(
      { email: process.env.ADMIN_EMAIL.toLowerCase() },
      { $set: { name: "Admin", password: hash, role: "admin", verified: true } },
      { upsert: true }
    );
    console.log("Admin account ready");
  }
}

// Emails the admin about items below their reorder level.
// An item is only marked as "alerted" if the email was really sent,
// so a failed email is tried again on the next run instead of being lost.
async function checkLowStock() {
  const low = await Inventory.find({
    alerted: false,
    active: { $ne: false },
    $expr: { $lt: ["$stock", { $ifNull: ["$reorderLevel", LIMIT()] }] },
  });
  if (!low.length) return;
  const rows = low
    .map((i) => `<li>${esc(i.name)} (${esc(i.type)}): ${i.stock} ${esc(i.unit || "pcs")} left, reorder level ${levelOf(i)}${i.supplier ? ", supplier: " + esc(i.supplier) : ""}</li>`)
    .join("");
  const sent = await sendMail(process.env.ADMIN_EMAIL, "Low stock alert", `<h3>Items below their reorder level</h3><ul>${rows}</ul>`);
  if (sent) await Inventory.updateMany({ _id: { $in: low.map((i) => i._id) } }, { alerted: true });
}

// Looks at unpaid orders that are holding stock:
//  - paid on Stripe but the customer never came back -> mark the order paid
//  - session expired or abandoned -> give the stock back
let reconciling = false;
async function reconcileOrders() {
  if (reconciling) return;
  reconciling = true;
  try {
    const orders = await Order.find({ paid: false, held: true, createdAt: { $lt: new Date(Date.now() - 60 * 1000) } }).limit(50);
    let stripe = null;
    for (const o of orders) {
      try {
        if (!o.stripeSession) {
          if (o.createdAt < new Date(Date.now() - 5 * 60 * 1000)) await releaseOrder(o._id);
          continue;
        }
        stripe = stripe || getStripe();
        const s = await stripe.checkout.sessions.retrieve(o.stripeSession);
        if (s.payment_status === "paid") {
          if (await finalizePaid(o._id)) {
            console.log("Order marked paid by reconcile job:", String(o._id));
            await checkLowStock().catch((e) => console.error(e.message));
          }
        } else if (s.status === "expired") {
          await releaseOrder(o._id);
        } else if (o.reservedUntil && o.reservedUntil < new Date()) {
          // Close the session first. This throws if the customer just paid, and then we try again next round.
          await stripe.checkout.sessions.expire(s.id);
          await releaseOrder(o._id);
        }
      } catch (e) {
        console.error("Reconcile failed for order", String(o._id), e.message);
      }
    }
  } finally {
    reconciling = false;
  }
}

function startJobs() {
  cron.schedule("*/30 * * * *", () => checkLowStock().catch((e) => console.error(e.message)));
  cron.schedule("*/2 * * * *", () => reconcileOrders().catch((e) => console.error(e.message)));
}

module.exports = { seed, checkLowStock, reconcileOrders, startJobs, getStripe, LIMIT };
