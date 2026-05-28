const userService = require("../user/user.service.js");
const User = require("./user.model.js");

async function register(req, res) {
  try {
    const result = await userService.registerUser(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function verifyEmail(req, res) {
  try {
    await userService.verifyEmail(req.params.token);
    return res.status(200).json({ message: "Email verified successfully." });
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

async function getStats(req, res) {
  try {
    const stats = await userService.getSystemStats();
    return res.status(200).json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function addSearchEntry(req, res) {
  try {
    const { query, type } = req.body;
    if (!query || !String(query).trim()) {
      return res.status(400).json({ message: "query is required" });
    }
    await userService.addSearchEntry(req.user.id, query, type);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getSearchHistory(req, res) {
  try {
    const history = await userService.getSearchHistory(req.user.id);
    return res.status(200).json(history);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function clearSearchHistory(req, res) {
  try {
    await userService.clearSearchHistory(req.user.id);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function addFriend(req, res) {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "username is required" });
    const friend = await userService.addFriend(req.user.id, username);
    return res.status(200).json(friend);
  } catch (err) {
    if (err.message === "user not found") return res.status(404).json({ message: "User not found" });
    if (err.message === "cannot add yourself") return res.status(400).json({ message: err.message });
    return res.status(500).json({ message: err.message });
  }
}

async function removeFriend(req, res) {
  try {
    await userService.removeFriend(req.user.id, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function getFriends(req, res) {
  try {
    const friends = await userService.getFriends(req.user.id);
    return res.status(200).json(friends);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function getSearchAnalytics(req, res) {
  try {
    const analytics = await userService.getSearchAnalytics(req.user.id);
    return res.status(200).json(analytics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
  getStats,
  addSearchEntry,
  getSearchHistory,
  clearSearchHistory,
  getSearchAnalytics,
  addFriend,
  removeFriend,
  getFriends,
  verifyEmail,
};
