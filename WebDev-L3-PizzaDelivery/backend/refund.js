// The ONLY place that talks to the payment gateway to give money back.
// The project currently ships with Stripe; if you switched to Razorpay, replace the body of
// refundOrder() with razorpay.payments.refund(paymentId, { amount }) and keep the same return shape.
const { getStripe } = require("./jobs");

/** Refunds a paid order. Saves refundId / refundedAt on it. Throws a readable error if it fails. */
async function refundOrder(order) {
  if (order.refundId) return order;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(order.stripeSession);
  if (!session.payment_intent) throw new Error("No payment found for this order");
  const refund = await stripe.refunds.create({ payment_intent: session.payment_intent }, { idempotencyKey: "refund-" + order._id });
  order.refundId = refund.id;
  order.refundedAt = new Date();
  order.refundError = undefined;
  await order.save();
  return order;
}

module.exports = { refundOrder };