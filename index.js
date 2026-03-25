require("dotenv").config();
const express = require("express");
const cors = require("cors");
const wineRoutes = require("./src/wine/wine.router.js");
const userRoutes = require("./src/user/user.router.js");
const recipeRouter = require("./src/recipe/recipe.router");
const connectDB = require("./src/database/connect.js");
const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/wines", wineRoutes);
app.use("/api/users", userRoutes);
app.use("/api/recipes", recipeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
