const bcrypt = require("bcryptjs");
const cron = require("node-cron");
const { User, Inventory } = require("./models");
const { sendMail } = require("./mailer");

const LIMIT = () => parseInt(process.env.LOW_STOCK_THRESHOLD) || 20;

async function seed() {
  if ((await Inventory.countDocuments()) === 0) {
    const mk = (type, list) => list.map(([name, price]) => ({ type, name, price, stock: 50 }));
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

async function checkLowStock() {
  const low = await Inventory.find({ stock: { $lt: LIMIT() }, alerted: false });
  if (!low.length) return;
  const rows = low.map((i) => `<li>${i.name} (${i.type}): ${i.stock} left</li>`).join("");
  await sendMail(process.env.ADMIN_EMAIL, "Low stock alert", `<h3>Stock below ${LIMIT()}</h3><ul>${rows}</ul>`);
  await Inventory.updateMany({ _id: { $in: low.map((i) => i._id) } }, { alerted: true });
}

function startJobs() {
  cron.schedule("*/30 * * * *", () => checkLowStock().catch((e) => console.error(e.message)));
}

module.exports = { seed, checkLowStock, startJobs, LIMIT };