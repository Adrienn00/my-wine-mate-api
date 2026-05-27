require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("./user.model.js");
const bcrypt = require("bcrypt");
const Wine = require("../wine/wine.model.js");
const Recipe = require("../recipe/recipe.model.js");
const PairingFeedback = require("../pairing/pairingFeedback.model.js");
const PairingRule = require("../pairing/pairing.model.js");
const PairingTrainingRun = require("../pairing/pairingTrainingRun.model.js");
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const TRAINING_METRICS_PATH = path.join(__dirname, "../../ai/artifacts/training_metrics.json");

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      isAdmin: user.isAdmin || false,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function registerUser(userData) {
  const userExist = await User.findOne({ $or: [{ email: userData.email }, { username: userData.username }] });
  if (userExist) {
    throw new Error("This username or email is already in use");
  }
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

  const newUser = new User({
    ...userData,
    password: hashedPassword,
  });

  const savedUser = await newUser.save();
  const token = generateToken(savedUser);

  return {
    id: savedUser._id,
    username: savedUser.username,
    email: savedUser.email,
    token,
  };
}

async function loginUser({ email, password }) {
  // Populate favorites during login so the client receives the full data immediately.
  const user = await User.findOne({ email }).populate("favoriteWines").populate("favoriteRecipes");

  if (!user) {
    throw new Error("Email is incorrect");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Password is incorrect");
  }
  const token = generateToken(user);
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
    img: user.img || null,
    favoriteWines: user.favoriteWines,
    favoriteRecipes: user.favoriteRecipes,
    token,
  };
}

// Returns the authenticated user with populated favorites.
async function getUser(userId) {
  const user = await User.findById(userId).populate("favoriteWines").populate("favoriteRecipes");
  if (!user) throw new Error("User not found");
  return user;
}

async function updateUser(userId, updatedData) {
  const user = await User.findByIdAndUpdate(userId, updatedData, {
    new: true,
    runValidators: true,
  })
    .select("-password")
    .populate("favoriteWines")
    .populate("favoriteRecipes");

  if (!user) throw new Error("User not found");
  return user;
}

async function deleteUser(userId) {
  const deleted = await User.findByIdAndDelete(userId);
  if (!deleted) throw new Error("User not found");
  return deleted;
}

async function getAllUsers() {
  return await User.find().select("-password");
}

// Favorite wines
async function addFavoriteWine(userId, wineId) {
  const user = await User.findById(userId);
  if (!user.favoriteWines.includes(wineId)) {
    user.favoriteWines.push(wineId);
    await user.save();
  }
  // Return the fully populated favorites list.
  const updatedUser = await User.findById(userId).populate("favoriteWines");
  return updatedUser.favoriteWines;
}

async function removeFavoriteWine(userId, wineId) {
  const user = await User.findById(userId);
  user.favoriteWines = user.favoriteWines.filter((id) => id.toString() !== wineId.toString());
  await user.save();

  const updatedUser = await User.findById(userId).populate("favoriteWines");
  return updatedUser.favoriteWines;
}

// Favorite recipes
async function addFavoriteRecipe(userId, recipeId) {
  const user = await User.findById(userId);
  if (!user.favoriteRecipes.includes(recipeId)) {
    user.favoriteRecipes.push(recipeId);
    await user.save();
  }
  // Return the fully populated favorites list.
  const updatedUser = await User.findById(userId).populate("favoriteRecipes");
  return updatedUser.favoriteRecipes;
}

async function removeFavoriteRecipe(userId, recipeId) {
  const user = await User.findById(userId);
  user.favoriteRecipes = user.favoriteRecipes.filter((id) => id.toString() !== recipeId.toString());
  await user.save();

  const updatedUser = await User.findById(userId).populate("favoriteRecipes");
  return updatedUser.favoriteRecipes;
}

// Updates a user's admin role.
async function updateUserRole(userId, isAdmin) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  user.isAdmin = isAdmin;
  await user.save();
  return user;
}

async function getSystemStats() {
  const [
    usersCount,
    adminUsersCount,
    winesCount,
    confirmedWinesCount,
    pendingWinesCount,
    recipesCount,
    confirmedRecipesCount,
    pendingRecipesCount,
    activePairingRulesCount,
    feedbackTotal,
    feedbackGood,
    feedbackBad,
    w2rTotal,
    w2rGood,
    r2wTotal,
    r2wGood,
    llmAutoApproved,
    llmPending,
    ratingAgg,
    topRatedWines,
    trainingHistory,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isAdmin: true }),
    Wine.countDocuments(),
    Wine.countDocuments({ is_confirmed: true }),
    Wine.countDocuments({ is_confirmed: false }),
    Recipe.countDocuments(),
    Recipe.countDocuments({ is_confirmed: true }),
    Recipe.countDocuments({ is_confirmed: false }),
    PairingRule.countDocuments({ active: true }),
    PairingFeedback.countDocuments({ status: "approved" }),
    PairingFeedback.countDocuments({ status: "approved", feedback: "good" }),
    PairingFeedback.countDocuments({ status: "approved", feedback: "bad" }),
    PairingFeedback.countDocuments({ status: "approved", direction: "wine_to_recipe" }),
    PairingFeedback.countDocuments({ status: "approved", direction: "wine_to_recipe", feedback: "good" }),
    PairingFeedback.countDocuments({ status: "approved", direction: "recipe_to_wine" }),
    PairingFeedback.countDocuments({ status: "approved", direction: "recipe_to_wine", feedback: "good" }),
    PairingFeedback.countDocuments({ source: "llm", status: "approved" }),
    PairingFeedback.countDocuments({ source: "llm", status: "pending" }),
    Wine.aggregate([
      { $match: { is_confirmed: true, ratings: { $exists: true, $not: { $size: 0 } } } },
      { $unwind: "$ratings" },
      { $match: { "ratings.rating": { $type: "number" } } },
      { $group: { _id: null, avgRating: { $avg: "$ratings.rating" }, totalRatings: { $sum: 1 } } },
    ]),
    Wine.aggregate([
      { $match: { is_confirmed: true } },
      { $project: {
        name: 1,
        ratingsCount: { $size: { $ifNull: ["$ratings", []] } },
        avgRating: { $avg: "$ratings.rating" },
      }},
      { $match: { ratingsCount: { $gt: 0 } } },
      { $sort: { ratingsCount: -1 } },
      { $limit: 5 },
    ]),
    PairingTrainingRun.find({ status: "completed" })
      .sort({ completedAt: -1 })
      .limit(5)
      .select("triggerSource completedAt metrics approvedFeedbackCount"),
  ]);

  let modelMetrics = null;
  try {
    if (fs.existsSync(TRAINING_METRICS_PATH)) {
      modelMetrics = JSON.parse(fs.readFileSync(TRAINING_METRICS_PATH, "utf-8"));
    }
  } catch {}

  const avgRating = ratingAgg[0]?.avgRating ?? null;
  const totalRatings = ratingAgg[0]?.totalRatings ?? 0;

  return {
    catalog: {
      usersCount,
      adminUsersCount,
      winesCount,
      confirmedWinesCount,
      pendingWinesCount,
      recipesCount,
      confirmedRecipesCount,
      pendingRecipesCount,
      activePairingRulesCount,
    },
    recommendationQuality: {
      feedbackTotal,
      feedbackGood,
      feedbackBad,
      accuracyPercent: feedbackTotal > 0 ? Math.round((feedbackGood / feedbackTotal) * 100) : null,
      wineToRecipe: {
        total: w2rTotal,
        good: w2rGood,
        accuracyPercent: w2rTotal > 0 ? Math.round((w2rGood / w2rTotal) * 100) : null,
      },
      recipeToWine: {
        total: r2wTotal,
        good: r2wGood,
        accuracyPercent: r2wTotal > 0 ? Math.round((r2wGood / r2wTotal) * 100) : null,
      },
      llm: {
        autoApproved: llmAutoApproved,
        pending: llmPending,
      },
    },
    modelPerformance: {
      metrics: modelMetrics,
      trainingHistory: trainingHistory.map((run) => ({
        triggerSource: run.triggerSource,
        completedAt: run.completedAt,
        approvedFeedbackCount: run.approvedFeedbackCount,
        accuracy: run.metrics?.accuracy ?? null,
        roc_auc: run.metrics?.roc_auc ?? null,
        rows: run.metrics?.rows ?? null,
      })),
    },
    wineRatings: {
      avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
      totalRatings,
      topRatedWines: topRatedWines.map((w) => ({
        _id: w._id,
        name: w.name,
        ratingsCount: w.ratingsCount,
        avgRating: w.avgRating !== null ? Math.round(w.avgRating * 10) / 10 : null,
      })),
    },
    // legacy fields for backward compatibility
    usersCount,
    winesCount,
    confirmedWinesCount,
    pendingWinesCount,
  };
}

async function addFriend(userId, targetUsername) {
  const target = await User.findOne({ username: targetUsername }).select("_id username");
  if (!target) throw new Error("user not found");
  if (target._id.toString() === userId) throw new Error("cannot add yourself");

  await User.findByIdAndUpdate(userId, { $addToSet: { friends: target._id } });
  return { _id: target._id, username: target.username };
}

async function removeFriend(userId, friendId) {
  await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
}

async function getFriends(userId) {
  const user = await User.findById(userId).populate("friends", "username firstName lastName");
  if (!user) throw new Error("User not found");
  return user.friends;
}

const SEARCH_HISTORY_LIMIT = 100;

async function addSearchEntry(userId, query, type = "general") {
  const q = String(query || "").trim();
  if (!q) return;

  await User.findByIdAndUpdate(userId, {
    $push: {
      searchHistory: {
        $each: [{ query: q, type, searchedAt: new Date() }],
        $slice: -SEARCH_HISTORY_LIMIT,
      },
    },
  });
}

async function getSearchHistory(userId) {
  const user = await User.findById(userId).select("searchHistory");
  if (!user) throw new Error("User not found");
  return [...user.searchHistory].reverse();
}

async function clearSearchHistory(userId) {
  await User.findByIdAndUpdate(userId, { $set: { searchHistory: [] } });
}

async function getSearchAnalytics(userId) {
  const user = await User.findById(userId).select("searchHistory");
  if (!user) throw new Error("User not found");

  const history = user.searchHistory;

  const queryFreq = {};
  const byType = {};
  const byDay = {};

  for (const entry of history) {
    const q = entry.query.toLowerCase();
    queryFreq[q] = (queryFreq[q] || 0) + 1;
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    const day = entry.searchedAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  const topQueries = Object.entries(queryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  return {
    totalSearches: history.length,
    topQueries,
    byType,
    byDay,
  };
}

module.exports = {
  registerUser,
  loginUser,
  addFavoriteWine,
  removeFavoriteWine,
  addFavoriteRecipe,
  removeFavoriteRecipe,
  updateUser,
  getUser,
  deleteUser,
  getAllUsers,
  updateUserRole,
  getSystemStats,
  addSearchEntry,
  getSearchHistory,
  clearSearchHistory,
  getSearchAnalytics,
  addFriend,
  removeFriend,
  getFriends,
};
