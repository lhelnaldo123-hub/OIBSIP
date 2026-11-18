const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { seed, startJobs } = require("./jobs");

const app = express();
app.set("trust proxy", 1); // behind Render's proxy, so req.ip is the visitor's address
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ message: "Pizza Delivery API is running" }));
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "not connected" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/admin", require("./routes/admin"));

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    await seed();
    startJobs();
    app.listen(PORT, () => console.log("Server running on port " + PORT));
  })
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });