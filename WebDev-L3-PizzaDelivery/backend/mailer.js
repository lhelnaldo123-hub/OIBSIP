const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Returns true if the email was sent, false if it was not.
// Callers (like the low-stock alert) must check this before marking anything as "sent".
async function sendMail(to, subject, html, fallbackLink) {
  if (!to) {
    console.error("Email skipped: no recipient address");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"Pizza Delivery" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log("Email sent to", to);
    return true;
  } catch (e) {
    console.error("Email failed:", e.message);
    if (fallbackLink) console.log("LINK FOR " + to + ": " + fallbackLink);
    return false;
  }
}

module.exports = { sendMail };
