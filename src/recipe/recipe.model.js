const mongoose = require("mongoose");

const RecipeSchema = new mongoose.Schema({
  name: String,

  description: String,

  ingredients: [String],

  instructions: [String],

  imageUrl: String,

  tags: [String],

  winePairingHints: [String],

  ratings: [mongoose.Schema.Types.Mixed],

  is_confirmed: {
    type: Boolean,
    default: false,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
});

module.exports = mongoose.model("Recipe", RecipeSchema);
