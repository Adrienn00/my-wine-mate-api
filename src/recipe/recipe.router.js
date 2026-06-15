const express = require("express");
const router = express.Router();

const recipeController = require("./recipe.controller");

const { authMiddleware, adminMiddleware } = require("../user/user.middleware");

router.post("/:id/rating", authMiddleware, recipeController.newRating);
router.delete("/:id/rating/:ratingId", authMiddleware, adminMiddleware, recipeController.removeRating);

router.get("/", recipeController.getRecipes);
router.get("/admin/ratings", authMiddleware, adminMiddleware, recipeController.getRatingList);
router.get("/:id", recipeController.getRecipesById);

router.post("/", authMiddleware, recipeController.addRecipe);

router.put("/:id", authMiddleware, adminMiddleware, recipeController.updateRecipe);

router.delete("/:id", authMiddleware, adminMiddleware, recipeController.deleteRecipe);

module.exports = router;
