const express = require("express");
const router = express.Router();

const recipeController = require("./recipe.controller");

const { authMiddleware, adminMiddleware } = require("../user/user.middleware");

router.post("/:id/rating", authMiddleware, recipeController.newRating);

router.get("/", recipeController.getRecipes);
router.get("/:id", recipeController.getRecipesById);

router.post("/", authMiddleware, recipeController.addRecipe);

router.put("/:id", authMiddleware, adminMiddleware, recipeController.updateRecipe);

router.delete("/:id", authMiddleware, adminMiddleware, recipeController.deleteRecipe);

module.exports = router;
