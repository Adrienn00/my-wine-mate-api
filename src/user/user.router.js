const express = require("express");
const router = express.Router();

const { authMiddleware } = require("./user.middleware");
const userController = require("./user.controller");

router.post("/register", userController.register);
router.post("/login", userController.login);

router.get("/profile", authMiddleware, userController.getUser);
router.put("/profile", authMiddleware, userController.updateUser);
router.delete("/profile", authMiddleware, userController.deleteUser);

router.get("/all", authMiddleware, userController.getAllUsers);

router.post("/favorite/wines", authMiddleware, userController.addFavoriteWine);
router.delete("/favorite/wines/:id", authMiddleware, userController.removeFavoriteWine);

router.post("/favorite/recipes", authMiddleware, userController.addFavoriteRecipe);
router.delete("/favorite/recipes/:id", authMiddleware, userController.removeFavoriteRecipe);

router.delete("/notifications/:id", authMiddleware, userController.deleteNotification);
module.exports = router;
