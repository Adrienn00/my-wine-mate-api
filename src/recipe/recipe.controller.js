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
    const reviewer = req.user?.username || req.user?.email || "A user";

    const updateRatings = await recipeService.addRating(id, rating, comment, reviewer);

    if (updateRatings) {
      const hasComment = String(comment || "").trim().length > 0;
      const notifMsg = hasComment
        ? `${reviewer} rated "${updateRatings.name}" (★${rating}) and left a review.`
        : `${reviewer} rated "${updateRatings.name}" (★${rating}).`;

      const admins = await User.find({
        isAdmin: true,
        _id: { $ne: req.user?.id },
      }).select("_id notifications");

      await Promise.all(
        admins.map(async (admin) => {
          admin.notifications.push({
            message: notifMsg,
            type: "moderation",
            link: `/recipe/${updateRatings._id}`,
          });
          await admin.save();
        })
      );

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

async function getRatingList(req, res) {
  try {
    const ratings = await recipeService.getRatingList();
    return res.status(200).json(ratings);
  } catch (err) {
    return res.status(500).json({
      message: "Error while fetching recipe ratings",
      error: err.message,
    });
  }
}

async function removeRating(req, res) {
  try {
    const id = req.params.id;
    const ratingId = req.params.ratingId;
    const updatedRecipe = await recipeService.deleteRating(id, ratingId);
    return res.status(200).json(updatedRecipe);
  } catch (err) {
    if (err.message === "recipe not found") {
      return res.status(404).json({ message: "Recipe Not Found" });
    }
    if (err.message === "rating not found") {
      return res.status(404).json({ message: "Rating Not Found" });
    }
    return res.status(500).json({ message: "Error while deleting rating", error: err.message });
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
  getRatingList,
  removeRating,
  getRecipesById,
};
