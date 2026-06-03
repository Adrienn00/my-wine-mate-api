require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const FRONTEND_URL = process.env.FRONTEND_URL || "https://my-wine-mate.vercel.app";

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "MyWineMate", email: process.env.MAIL_USER },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${text}`);
  }
}

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
  const byEmail = await User.findOne({ email: userData.email });
  if (byEmail) {
    if (!byEmail.isVerified) {
      await User.deleteOne({ _id: byEmail._id });
    } else {
      throw new Error("This email is already in use");
    }
  }

  const byUsername = await User.findOne({ username: userData.username });
  if (byUsername) {
    if (!byUsername.isVerified) {
      await User.deleteOne({ _id: byUsername._id });
    } else {
      throw new Error("This username is already in use");
    }
  }
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const newUser = new User({
    ...userData,
    password: hashedPassword,
    verificationToken,
    verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const savedUser = await newUser.save();

  const verifyUrl = `${FRONTEND_URL}/verify/${verificationToken}`;
  try {
    await sendEmail(
      savedUser.email,
      "Confirm your MyWineMate account",
      `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#5d1f32">Welcome to MyWineMate 🍷</h2>
        <p>Hi <strong>${savedUser.username}</strong>, click the button below to verify your email address. The link expires in 24 hours.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#5d1f32;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#888;font-size:13px">Or copy this link: ${verifyUrl}</p>
      </div>`
    );
  } catch (mailErr) {
    console.error("[mailer] Failed to send verification email:", mailErr.message);
    await User.deleteOne({ _id: savedUser._id });
    throw new Error("Could not send verification email. Please check the address and try again.");
  }

  return { email: savedUser.email };
}

async function loginUser({ email, password }) {
  // Populate favorites during login so the client receives the full data immediately.
  const user = await User.findOne({ email }).populate("favoriteWines").populate("favoriteRecipes");

  if (!user) {
    throw new Error("Email is incorrect");
  }

  if (!user.isVerified && user.verificationToken) {
    throw new Error("Please verify your email before logging in.");
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

async function verifyEmail(token) {
  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpires: { $gt: new Date() },
  });
  if (!user) throw new Error("Invalid or expired verification link.");
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
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
