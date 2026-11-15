const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

async function sendMail(to, subject, html, fallbackLink) {
  try {
    await transporter.sendMail({
      from: `"Pizza Delivery" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log("Email sent to", to);
  } catch (e) {
    console.error("Email failed:", e.message);
    if (fallbackLink) console.log("LINK FOR " + to + ": " + fallbackLink);
  }
}

module.exports = { sendMail };