require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");

const Recipe = require("./src/recipe/recipe.model");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const recipes = JSON.parse(fs.readFileSync("recipes_clean.json"));

  const formatted = recipes.map(r => ({
    name: r.name,
    ingredients: r.ingredients,
    instructions: r.instructions,
    url: r.url,
    is_confirmed: true
  }));

  await Recipe.insertMany(formatted);

  console.log("Imported recipes:", formatted.length);

  process.exit();
}

run();

