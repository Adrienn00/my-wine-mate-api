require("dotenv").config();
const jwt = require("jsonwebtoken");
const User = require("./user.model.js");
const bcrypt = require("bcrypt");
const Wine = require("../wine/wine.model.js");
const Recipe = require("../recipe/recipe.model.js"); // Ezt add hozzá a biztonság kedvéért
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

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
    throw new Error("This username or email is already in used");
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
  // LOGIN-NÁL IS ÉRDEMES POPULATE-OT HASZNÁLNI, hogy az első belépéskor is jó legyen minden
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
    favoriteWines: user.favoriteWines, // Így rögtön megkapja a frontend
    favoriteRecipes: user.favoriteRecipes,
    token,
  };
}

// EZT A FÜGGVÉNYT A CONTROLLERBŐL HIVOD, de a service-ben is legyen rendben:
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

// --- KEDVENC BOROK JAVÍTVA ---
async function addFavoriteWine(userId, wineId) {
  const user = await User.findById(userId);
  if (!user.favoriteWines.includes(wineId)) {
    user.favoriteWines.push(wineId);
    await user.save();
  }
  // Visszaadjuk a TELJES listát kifejtve
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

// --- KEDVENC RECEPTEK JAVÍTVA ---
async function addFavoriteRecipe(userId, recipeId) {
  const user = await User.findById(userId);
  if (!user.favoriteRecipes.includes(recipeId)) {
    user.favoriteRecipes.push(recipeId);
    await user.save();
  }
  // Visszaadjuk a TELJES listát kifejtve (ÍGY LESZ NEVE A RECEPTNEK!)
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

// JAVÍTVA: Az isAdmin paraméter hiányzott a függvényből
async function updateUserRole(userId, isAdmin) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  user.isAdmin = isAdmin;
  await user.save();
  return user;
}

async function getSystemStats() {
  const usersCount = await User.countDocuments();
  const winesCount = await Wine.countDocuments();
  const confirmedWinesCount = await Wine.countDocuments({ is_confirmed: true });
  const pendingWinesCount = await Wine.countDocuments({ is_confirmed: false });
  return {
    usersCount,
    winesCount,
    confirmedWinesCount,
    pendingWinesCount,
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
};
