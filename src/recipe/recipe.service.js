const Recipe = require("./recipe.model");

async function getAllRecipes() {
  return await Recipe.find();
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

async function addRating(id, rating, comment) {
  const recipe = await Recipe.findById(id);

  if (!recipe) throw new Error("recipe not found");

  const newRating = {
    rating,
    comment,
  };

  recipe.ratings.push(newRating);

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
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addRating,
};
