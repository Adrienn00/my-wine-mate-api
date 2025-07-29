const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware example
app.use(express.json());

// Example route
app.get("/", (req, res) => {
  res.send("Hello, Express!");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
