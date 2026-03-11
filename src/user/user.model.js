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
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    favoriteWines: [{ type: mongoose.Schema.Types.ObjectId, ref: "Wine" }],
    favoriteRecipes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
    notifications: [
      {
        message: { type: String },
        type: { type: String }, // approved | rejected
        createdAt: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
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
      wineYears: String,
      priceRanges: [String],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
