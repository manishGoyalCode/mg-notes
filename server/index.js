const express = require("express");
const path = require("path");
const { getState, setState } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json({ limit: "5mb" }));

// Serve static files (index.html, app.js, styles.css)
app.use(express.static(path.join(__dirname, "..")));

// --- API ---

// GET /api/state — return the full state (or null if fresh)
app.get("/api/state", (_req, res) => {
  const state = getState();
  res.json(state);
});

// PUT /api/state — save the full state
app.put("/api/state", (req, res) => {
  const state = req.body;
  if (!state || typeof state !== "object") {
    return res.status(400).json({ error: "Invalid state object" });
  }
  setState(state);
  res.json({ ok: true });
});

// Fallback: serve index.html for any unknown route
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(PORT, () => {
  console.log(`TaskTracker server running at http://localhost:${PORT}`);
});
