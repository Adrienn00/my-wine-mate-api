const recipeService = require("../recipe/recipe.service.js");
const User = require("../user/user.model");

async function getRecipes(req, res) {
  try {
    const allRecipes = await recipeService.getAllRecipes();
    res.status(200).json(allRecipes);
  } catch (err) {
    res.status(500).json({
      message: "Error while fetching recipes",
      error: err.message,
    });
  }
}

async function addRecipe(req, res) {
  try {
    const recipeData = {
      ...req.body,
      createdBy: req.user.id,
      isConfirmed: req.user.isAdmin ? true : false,
    };

    const recipe = await recipeService.addRecipe(recipeData);

    res.status(201).json(recipe);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function newRating(req, res) {
  try {
    const id = req.params.id;
    const { rating, comment } = req.body;

    const updateRatings = await recipeService.addRating(id, rating, comment);

    if (updateRatings) {
      res.status(200).json(updateRatings);
    } else {
      res.status(404).json({ message: "Recipe Not Found" });
    }
  } catch (err) {
    res.status(500).json({
      message: "Error while updating ratings",
      error: err.message,
    });
  }
}

async function updateRecipe(req, res) {
  try {
    const id = req.params.id;
    const updatedData = req.body;

    const updatedRecipe = await recipeService.updateRecipe(id, updatedData);

    if (!updatedRecipe) {
      return res.status(404).json({ message: "Recipe Not Found" });
    }

    const user = await User.findById(updatedRecipe.createdBy);

    if (user) {
      // APPROVED
      if (updatedData.is_confirmed === true) {
        user.notifications.push({
          message: `Your recipe "${updatedRecipe.name}" has been approved.`,
          type: "approved",
        });
      }

      // REJECTED
      if (updatedData.rejectionReason) {
        user.notifications.push({
          message: `Your recipe "${updatedRecipe.name}" was rejected. Reason: ${updatedData.rejectionReason}`,
          type: "rejected",
        });
      }

      await user.save();
    }

    res.status(200).json(updatedRecipe);
  } catch (err) {
    res.status(500).json({
      message: "Error while updating recipe",
      error: err.message,
    });
  }
}

async function deleteRecipe(req, res) {
  try {
    const id = req.params.id;

    const deleted = await recipeService.deleteRecipe(id);

    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: "Recipe Not Found" });
    }
  } catch (err) {
    res.status(500).json({
      message: "Error while deleting recipe",
      error: err.message,
    });
  }
}
async function getRecipesById(req, res) {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ message: "Recipe Not Found" });
    res.status(200).json(recipe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getRecipes,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  newRating,
  getRecipesById,
};
