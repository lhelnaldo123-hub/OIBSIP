// Stock helpers. Every change to stock goes through adjust(), so it is
// atomic (never below zero) and always leaves a row in the stock log.
const { Inventory, Order, StockLog } = require("./models");

const LIMIT = () => parseInt(process.env.LOW_STOCK_THRESHOLD) || 20;

// The reorder level of one item: its own value, or the shop-wide default.
const levelOf = (item) => (item.reorderLevel === undefined || item.reorderLevel === null ? LIMIT() : item.reorderLevel);

const shortId = (id) => String(id).slice(-6).toUpperCase();

/**
 * Add (+) or remove (-) stock for one item.
 * Removing is refused if it would take the stock below zero.
 * meta: { reason, note, by, order }
 */
async function adjust(id, change, meta = {}) {
  if (!Number.isInteger(change) || change === 0) throw new Error("Enter a whole number that is not zero");
  const filter = { _id: id };
  if (change < 0) filter.stock = { $gte: -change };
  const item = await Inventory.findOneAndUpdate(filter, { $inc: { stock: change } }, { new: true });
  if (!item) {
    const exists = await Inventory.findById(id);
    if (!exists) throw new Error("Item not found");
    throw new Error("Not enough " + exists.name + " in stock (" + exists.stock + " left)");
  }
  // Once stock is back above its reorder level, allow a new low-stock alert later.
  if (item.alerted && item.stock >= levelOf(item)) {
    await Inventory.updateOne({ _id: item._id }, { alerted: false });
  }
  await StockLog.create({
    item: item._id,
    itemName: item.name,
    itemType: item.type,
    change,
    before: item.stock - change,
    after: item.stock,
    reason: meta.reason || "other",
    note: String(meta.note || "").slice(0, 200),
    by: meta.by || "system",
    order: meta.order,
  });
  return item;
}

/**
 * Take up to `qty` of an item for packaging-type usage. It never blocks a sale and never goes
 * below zero: if only 3 boxes are left and 4 are wanted, 3 are taken. Returns how many were taken.
 */
async function takeSoft(id, qty, meta) {
  for (let tries = 0; tries < 5; tries++) {
    const item = await Inventory.findById(id);
    if (!item) return 0;
    const n = Math.min(Math.max(item.stock || 0, 0), qty);
    if (n <= 0) return 0;
    try {
      await adjust(id, -n, meta);
      return n;
    } catch (e) {
      // someone else took stock at the same moment: look again
    }
  }
  return 0;
}

/**
 * Reserve stock for an unpaid order.
 * Ingredients (not soft) are all-or-nothing: if one is short, the ones already taken are put back
 * and the error is thrown. Packaging (soft) is taken as far as stock allows and never blocks the order.
 * Returns the usage that was really taken, so releasing or cancelling later gives back exactly that.
 */
async function reserve(usage, order) {
  const taken = [];
  const meta = { reason: "order", note: "Order " + shortId(order._id), by: "customer order", order: order._id };
  try {
    for (const u of usage.filter((x) => !x.soft)) {
      await adjust(u.item, -u.qty, meta);
      taken.push({ item: u.item, qty: u.qty });
    }
    for (const u of usage.filter((x) => x.soft)) {
      const n = await takeSoft(u.item, u.qty, meta);
      if (n > 0) taken.push({ item: u.item, qty: n, soft: true });
    }
  } catch (e) {
    for (const u of taken) {
      await adjust(u.item, u.qty, { reason: "order-released", note: "Order " + shortId(order._id) + " could not be completed", by: "system", order: order._id }).catch(() => {});
    }
    throw e;
  }
  return taken;
}

/**
 * Give the reserved stock back and mark the order Expired.
 * Safe to call twice: only the first call that finds held=true does anything.
 */
async function releaseOrder(orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, held: true, paid: false },
    { held: false, status: "Expired" },
    { new: true }
  );
  if (!order) return false;
  for (const u of order.usage) {
    await adjust(u.item, u.qty, { reason: "order-released", note: "Order " + shortId(order._id) + " not paid", by: "system", order: order._id }).catch((e) => console.error("Release failed:", e.message));
  }
  return true;
}

/**
 * Mark an order paid. The stock was already taken when the order was created,
 * so nothing is deducted here. Safe to call twice.
 * Returns true only for the call that actually flipped the order to paid.
 */
async function finalizePaid(orderId) {
  const done = await Order.findOneAndUpdate(
    { _id: orderId, paid: false, status: { $ne: "Expired" } },
    { paid: true, status: "Order Received", held: false },
    { new: true }
  );
  return !!done;
}

/**
 * Cancel a PAID order. Marks it Cancelled once (safe to call twice: only the first call acts).
 * If restock is true the ingredients and packaging it used go back into stock.
 * Returns the cancelled order, or null if it was not paid or was already cancelled.
 */
async function cancelPaidOrder(orderId, { restock, note, by, cancelledBy = "admin", reason = "", onlyStatus }) {
  const filter = { _id: orderId, paid: true, status: { $ne: "Cancelled" } };
  if (onlyStatus) filter.status = onlyStatus;          // customers can only cancel while the order is still "Order Received"
  else filter.status = { $nin: ["Cancelled", "Delivered"] };
  const order = await Order.findOneAndUpdate(
    filter,
    { status: "Cancelled", cancelledAt: new Date(), cancelledBy, cancelReason: String(reason || "").slice(0, 80), cancelNote: String(note || "").slice(0, 200) },
    { new: true }
  );
  if (!order) return null;
  if (restock) {
    for (const u of order.usage) {
      await adjust(u.item, u.qty, { reason: "order-cancelled", note: "Order " + shortId(order._id) + " cancelled", by: by || "admin", order: order._id }).catch((e) => console.error("Restock failed:", e.message));
    }
  }
  return order;
}

module.exports = { LIMIT, levelOf, adjust, takeSoft, reserve, releaseOrder, finalizePaid, cancelPaidOrder, shortId };