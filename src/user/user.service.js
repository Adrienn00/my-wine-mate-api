require("dotenv").config();
const jwt = require("jsonwebtoken");
const User = require("./user.model.js");
const bcrypt = require("bcrypt");

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
  const user = await User.findOne({ email });
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
    token,
  };
}

async function getUser(userId) {
  const user = await User.findById(userId).select("-password").populate({ path: "favoriteWines", select: "_id name" });
  // .populate({ path: "favoriteRecipes", select: "name" });

  if (!user) throw new Error("User not found");
  return user;
}

async function updateUser(userId, updatedData) {
  const user = await User.findByIdAndUpdate(userId, updatedData, {
    new: true,
    runValidators: true,
  }).select("-password");
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

async function addFavoriteWine(userId, wineId) {
  const user = await User.findById(userId);
  if (!user.favoriteWines.includes(wineId)) {
    user.favoriteWines.push(wineId);
    await user.save();
  }
  return user.favoriteWines;
}

async function removeFavoriteWine(userId, wineId) {
  const user = await User.findById(userId);
  user.favoriteWines = user.favoriteWines.filter((id) => id.toString() !== wineId.toString());
  await user.save();
  return user.favoriteWines;
}

async function addFavoriteRecipe(userId, recipeId) {
  const user = await User.findById(userId);
  if (!user.favoriteRecipes.includes(recipeId)) {
    user.favoriteRecipes.push(recipeId);
    await user.save();
  }
  return user.favoriteRecipes;
}

async function removeFavoriteRecipe(userId, recipeId) {
  const user = await User.findById(userId);
  user.favoriteRecipes = user.favoriteRecipes.filter((id) => id.toString() !== recipeId.toString());
  await user.save();
  return user.favoriteRecipes;
}

async function updateUserRole(userId) {
  const user = await User.findById(userId);
  user.isAdmin = isAdmin;
  await user.save();
  return user;
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
};
