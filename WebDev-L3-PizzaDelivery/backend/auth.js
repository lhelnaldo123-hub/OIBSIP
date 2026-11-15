const jwt = require("jsonwebtoken");

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    req.user = jwt.verify(h.replace("Bearer ", ""), process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Please log in" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  next();
}

module.exports = { sign, auth, adminOnly };