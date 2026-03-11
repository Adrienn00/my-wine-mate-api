const mongoose = require("mongoose");

const WineSchema = new mongoose.Schema({
  name: String,
  winery: String,
  description: String,
  type: String,
  style: String,
  flavorProfiles: [String],
  origin: {
    country: String,
    region: String,
  },
  grapeVarieties: [String],
  year: Number,
  alcohol: Number,
  priceRange: String,
  foodPairingHints: [String],
  aiFoodPairingEnabled: Boolean,
  imageUrl: String,
  is_award_winner: Boolean,

  is_confirmed: {
    type: Boolean,
    default: true,
  },

  tags: [String],
  ratings: [mongoose.Schema.Types.Mixed],

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

module.exports = mongoose.model("Wine", WineSchema);
