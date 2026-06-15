const Recipe = require("./recipe.model");
const { randomUUID } = require("crypto");

async function getAllRecipes() {
  return await Recipe.find();
}

// Returns a single recipe by its id.
async function getRecipeById(id) {
  return await Recipe.findById(id);
}

async function getRatingList() {
  const recipes = await Recipe.find({ ratings: { $exists: true, $ne: [] } })
    .select("_id title name category ratings")
    .lean();

  return recipes.flatMap((recipe) =>
    (recipe.ratings || [])
      .map((rating, index) => ({
        itemType: "recipe",
        itemId: recipe._id,
        itemName: recipe.title || recipe.name,
        itemSubtitle: recipe.category || "",
        ratingId: String(rating?.ratingId || rating?._id || `idx-${index}`),
        rating: rating?.rating ?? null,
        comment: String(rating?.comment || "").trim(),
        userName: rating?.userName || "Unknown user",
        createdAt: rating?.createdAt || null,
      }))
      .filter((entry) => entry.comment)
  );
}

async function addRecipe(recipe) {
  const newRecipe = new Recipe({
    ...recipe,
    ratings: [],
    is_confirmed: false,
  });

  await newRecipe.save();
  return newRecipe;
}

async function addRating(id, rating, comment, userName = "Unknown user") {
  const recipe = await Recipe.findById(id);

  if (!recipe) throw new Error("recipe not found");

  const newRating = {
    rating: Number(rating),
    comment: String(comment || "").trim(),
    ratingId: randomUUID(),
    userName: String(userName || "").trim() || "Unknown user",
    createdAt: new Date(),
  };

  recipe.ratings.push(newRating);

  await recipe.save();

  return recipe;
}

async function deleteRating(recipeId, ratingId) {
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) throw new Error("recipe not found");

  const beforeCount = Array.isArray(recipe.ratings) ? recipe.ratings.length : 0;
  recipe.ratings = (recipe.ratings || []).filter((entry, index) => {
    const currentId = String(entry?.ratingId || entry?._id || `idx-${index}`);
    return currentId !== String(ratingId);
  });

  if (recipe.ratings.length === beforeCount) {
    throw new Error("rating not found");
  }

  await recipe.save();
  return recipe;
}

async function updateRecipe(id, updatedData) {
  const { _id, __v, ...cleanedUpdatedData } = updatedData;

  const updatedRecipe = await Recipe.findByIdAndUpdate(id, cleanedUpdatedData, {
    new: true,
    runValidators: true,
  });

  if (!updatedRecipe) {
    throw new Error("recipe not found");
  }

  return updatedRecipe;
}

async function deleteRecipe(id) {
  const result = await Recipe.deleteOne({ _id: id });

  return result.deletedCount > 0;
}

module.exports = {
  getAllRecipes,
  getRecipeById,
  getRatingList,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addRating,
  deleteRating,
};
