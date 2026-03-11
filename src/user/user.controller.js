const userService = require("../user/user.service.js");
const User = require("./user.model.js");

async function register(req, res) {
  try {
    const user = await userService.registerUser(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Field is missing" });
    }

    const user = await userService.loginUser({ email, password });
    res.status(200).json(user);
  } catch (error) {
    res.status(401).json({ message: error.message || "Login failure" });
  }
}

async function getUser(req, res) {
  try {
    const userId = req.user.id;
    const user = await userService.getUser(userId);
    return res.status(200).json(user);
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const userId = req.user.id;
    const updated = await userService.updateUser(userId, req.body);
    return res.status(200).json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = req.user.id;
    await userService.deleteUser(userId);
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
}

async function getAllUsers(req, res) {
  try {
    const users = await userService.getAllUsers();
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
async function addFavoriteWine(req, res) {
  const { wineId } = req.body;
  const userId = req.user.id;
  try {
    const favorites = await userService.addFavoriteWine(userId, wineId);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function removeFavoriteWine(req, res) {
  const wineId = req.params.id;
  const userId = req.user.id;
  try {
    const favorites = await userService.removeFavoriteWine(userId, wineId);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function addFavoriteRecipe(req, res) {
  const { recipeId } = req.body;
  const userId = req.user.id;
  try {
    const favorites = await userService.addFavoriteRecipe(userId, recipeId);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function removeFavoriteRecipe(req, res) {
  const recipeId = req.params.id;
  const userId = req.user.id;
  try {
    const favorites = await userService.removeFavoriteRecipe(userId, recipeId);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const user = await User.findById(userId);

    user.notifications = user.notifications.filter((n) => n._id.toString() !== notificationId);

    await user.save();

    res.status(200).json(user.notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function updateUserRole(req, res) {
  try {
    const { isAdmin } = req.body;

    const user = await User.findById(req.params.id);

    user.isAdmin = isAdmin;

    await user.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  register,
  login,
  getUser,
  updateUser,
  deleteUser,
  getAllUsers,
  addFavoriteWine,
  removeFavoriteWine,
  addFavoriteRecipe,
  removeFavoriteRecipe,
  deleteNotification,
  updateUserRole,
};
