const mongoose = require("mongoose");

const pairingFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true,
    },
    wineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wine",
      required: true,
    },
    direction: {
      type: String,
      enum: ["recipe_to_wine", "wine_to_recipe"],
      required: true,
    },
    feedback: {
      type: String,
      enum: ["good", "bad"],
      required: true,
    },
    recommendationScore: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

pairingFeedbackSchema.index(
  { userId: 1, recipeId: 1, wineId: 1, direction: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);

module.exports = mongoose.model("PairingFeedback", pairingFeedbackSchema);
