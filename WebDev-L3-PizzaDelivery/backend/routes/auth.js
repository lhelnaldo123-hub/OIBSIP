const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { User } = require("../models");
const { sign } = require("../auth");
const { sendMail } = require("../mailer");

const front = () => (process.env.FRONTEND_URL || "").replace(/\/$/, "");
const token = () => crypto.randomBytes(24).toString("hex");
const demo = () => process.env.DEMO_VERIFY === "true";

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: "All fields are required" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Invalid email" });
    if (String(password).length < 8 || !/\d/.test(password))
      return res.status(400).json({ error: "Password needs 8+ characters and a number" });
    if (await User.findOne({ email: String(email).toLowerCase() }))
      return res.status(400).json({ error: "Email already registered" });
    const verifyToken = token();
    await User.create({
      name: String(name).slice(0, 60),
      email,
      password: await bcrypt.hash(password, 10),
      verifyToken,
    });
    const link = `${front()}/#verify/${verifyToken}`;
    sendMail(email, "Verify your email", `<p>Welcome to Pizza Delivery!</p><p><a href="${link}">Verify my email</a></p>`, link);
    const out = { message: "Account created. Check your email to verify it." };
    if (demo()) out.verifyToken = verifyToken;
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/verify/:token", async (req, res) => {
  try {
    const u = await User.findOne({ verifyToken: req.params.token });
    if (!u) return res.status(400).json({ error: "Link invalid or already used" });
    u.verified = true;
    u.verifyToken = undefined;
    await u.save();
    res.json({ message: "Email verified! You can log in now." });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const u = await User.findOne({ email: String(email || "").toLowerCase(), role: "user" });
    if (!u || !(await bcrypt.compare(String(password || ""), u.password)))
      return res.status(401).json({ error: "Wrong email or password" });
    if (!u.verified) return res.status(403).json({ error: "Please verify your email first (check your inbox)" });
    res.json({ token: sign(u), name: u.name });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/forgot", async (req, res) => {
  try {
    const u = await User.findOne({ email: String((req.body || {}).email || "").toLowerCase(), role: "user" });
    const out = { message: "If that email exists, a reset link has been sent." };
    if (u) {
      u.resetToken = token();
      u.resetExpires = new Date(Date.now() + 3600000);
      await u.save();
      const link = `${front()}/#reset/${u.resetToken}`;
      sendMail(u.email, "Reset your password", `<p>Reset your password (valid 1 hour):</p><p><a href="${link}">Reset password</a></p>`, link);
      if (demo()) out.resetToken = u.resetToken;
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/reset/:token", async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 8 || !/\d/.test(password))
      return res.status(400).json({ error: "Password needs 8+ characters and a number" });
    const u = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: new Date() } });
    if (!u) return res.status(400).json({ error: "Reset link invalid or expired" });
    u.password = await bcrypt.hash(password, 10);
    u.resetToken = undefined;
    u.resetExpires = undefined;
    await u.save();
    res.json({ message: "Password changed. You can log in now." });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;