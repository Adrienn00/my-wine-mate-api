const express = require("express");
const cors = require("cors");
const wineRoutes = require("./src/wine/wine.router.js");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware example
app.use(cors());
app.use(express.json());

// prefixeljük az API-t
app.use("/api/wines", wineRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
