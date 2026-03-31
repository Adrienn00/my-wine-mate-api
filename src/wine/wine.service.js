const Wine = require("./wine.model");
const User = require("../user/user.model");
const { randomUUID } = require("crypto");

const RATING_FIELDS = ["tasteProfile", "aroma", "valueForMoney", "pairing"];

function normalizePurchaseOptions(options = []) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option = {}) => {
      const shopName = String(option.shopName || "").trim();
      const url = String(option.url || "").trim();
      const numericPrice = Number(option.price);

      return {
        shopName,
        price: Number.isFinite(numericPrice) ? numericPrice : undefined,
        currency: String(option.currency || "RON").trim() || "RON",
        url,
        updatedAt: option.updatedAt || new Date(),
      };
    })
    .filter((option) => option.shopName || option.url);
}

async function getAllWines() {
  return await Wine.find();
}

async function getWineById(id) {
  return await Wine.findById(id);
}

async function addWine(wine) {
  const newWine = new Wine({
    ...wine,
    purchaseOptions: normalizePurchaseOptions(wine.purchaseOptions),
    ratings: [],
    is_confirmed: false,
  });

  await newWine.save();
  return newWine;
}

function normalizeRatingValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const clamped = Math.max(1, Math.min(5, numeric));
  return Number(clamped.toFixed(1));
}

function buildRatingEntry({ rating, comment, criteria = {}, userId, userName }) {
  const normalizedCriteria = {};
  const criteriaValues = [];

  for (const key of RATING_FIELDS) {
    const normalized = normalizeRatingValue(criteria[key]);
    if (normalized !== null) {
      normalizedCriteria[key] = normalized;
      criteriaValues.push(normalized);
    }
  }

  const fallbackRating = normalizeRatingValue(rating);
  const overall =
    criteriaValues.length > 0
      ? Number((criteriaValues.reduce((sum, value) => sum + value, 0) / criteriaValues.length).toFixed(1))
      : fallbackRating;

  if (overall === null) {
    throw new Error("A valid rating is required.");
  }

  return {
    ratingId: randomUUID(),
    criteria: normalizedCriteria,
    overall,
    rating: overall,
    comment: String(comment || "").trim(),
    userId: userId || null,
    userName: String(userName || "").trim() || "Unknown user",
    createdAt: new Date(),
  };
}

async function resolveRatingUserName({ userId, userName }) {
  const trimmed = String(userName || "").trim();
  if (trimmed) return trimmed;
  if (!userId) return "Unknown user";

  const user = await User.findById(userId).select("username firstName lastName");
  if (!user) return "Unknown user";

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return fullName || user.username || "Unknown user";
}

async function addRating(id, payload = {}) {
  const wine = await Wine.findById(id);
  if (!wine) throw new Error("wine not found");

  const userName = await resolveRatingUserName(payload);
  wine.ratings.push(buildRatingEntry({ ...payload, userName }));

  await wine.save();

  return wine;
}

async function deleteRating(wineId, ratingId) {
  const wine = await Wine.findById(wineId);
  if (!wine) throw new Error("wine not found");

  const beforeCount = Array.isArray(wine.ratings) ? wine.ratings.length : 0;
  wine.ratings = (wine.ratings || []).filter((entry) => {
    const currentId = String(entry?.ratingId || entry?._id || "");
    return currentId !== String(ratingId);
  });

  if (wine.ratings.length === beforeCount) {
    throw new Error("rating not found");
  }

  await wine.save();
  return wine;
}

async function updateWine(id, updatedData) {
  const { _id, __v, ...cleanedUpdatedData } = updatedData;

  if (Object.prototype.hasOwnProperty.call(cleanedUpdatedData, "purchaseOptions")) {
    cleanedUpdatedData.purchaseOptions = normalizePurchaseOptions(cleanedUpdatedData.purchaseOptions);
  }

  const updatedWine = await Wine.findByIdAndUpdate(id, cleanedUpdatedData, {
    new: true,
    runValidators: true,
  });

  if (!updatedWine) {
    throw new Error("wine not found");
  }

  return updatedWine;
}

async function deleteWine(id) {
  const result = await Wine.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

module.exports = {
  getAllWines,
  getWineById,
  addWine,
  updateWine,
  deleteWine,
  addRating,
  deleteRating,
};
