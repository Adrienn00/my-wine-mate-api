const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String },
    location: { type: String },
    postalCode: { type: String },
    img: { type: String },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    favoriteWines: [{ type: mongoose.Schema.Types.ObjectId, ref: "Wine" }],
    favoriteRecipes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
    notifications: [
      {
        message: { type: String },
        type: { type: String },
        link: { type: String },
        createdAt: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
      },
    ],
    searchHistory: [
      {
        query: { type: String, required: true },
        type: { type: String, enum: ["wine", "recipe", "general"], default: "general" },
        searchedAt: { type: Date, default: Date.now },
      },
    ],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [
      {
        from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    preferences: {
      winery: [String],
      wineTypes: [String],
      style: [String],
      flavourProfile: [String],
      origin: {
        country: String,
        region: String,
      },
      grapeVarieties: [String],
      alcoholLevels: [String],
      foodPreferences: [String],
      recipeCategories: [String],
      recipeMeatTypes: [String],
      recipeDishTypes: [String],
      recipeMainIngredients: [String],
      wineYears: String,
      priceRanges: [String],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
