const mongoose = require("mongoose");

const normalizedStringArray = {
  type: [String],
  default: [],
};

const pairingCriteriaSchema = new mongoose.Schema(
  {
    wineTypes: normalizedStringArray,
    wineStyles: normalizedStringArray,
    wineFlavors: normalizedStringArray,
    wineAlcoholBuckets: normalizedStringArray,
    wineSweetness: normalizedStringArray,
    winePairingTargets: normalizedStringArray,
    recipeCategories: normalizedStringArray,
    dishTypes: normalizedStringArray,
    mainIngredients: normalizedStringArray,
    meatTypes: normalizedStringArray,
    spiceLevels: normalizedStringArray,
    foodSweetness: normalizedStringArray,
    spices: normalizedStringArray,
    cookingMethods: normalizedStringArray,
    textures: normalizedStringArray,
    sauceTypes: normalizedStringArray,
    wineBodies: normalizedStringArray,
    wineAcidity: normalizedStringArray,
    wineTannins: normalizedStringArray,
    grapeVarieties: normalizedStringArray,
  },
  { _id: false }
);

const pairingRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    label: {
      type: String,
      enum: ["good", "bad"],
      required: true,
    },
    confidence: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    score: {
      type: Number,
      default: 1,
    },
    source: {
      type: String,
      enum: ["expert", "system", "user"],
      default: "expert",
    },
    notes: { type: String, trim: true, default: "" },
    active: {
      type: Boolean,
      default: true,
    },
    criteria: {
      type: pairingCriteriaSchema,
      default: () => ({}),
    },
    examples: {
      wines: normalizedStringArray,
      foods: normalizedStringArray,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PairingRule", pairingRuleSchema);
