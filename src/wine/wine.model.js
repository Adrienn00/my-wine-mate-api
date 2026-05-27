const mongoose = require("mongoose");

const purchaseOptionSchema = new mongoose.Schema(
  {
    shopName: { type: String, trim: true },
    price: { type: Number },
    currency: { type: String, default: "RON", trim: true },
    url: { type: String, trim: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
  purchaseOptions: [purchaseOptionSchema],

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
