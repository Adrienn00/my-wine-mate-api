const Wine = require("./wine.model");

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

async function addRating(id, rating, comment) {
  const wine = await Wine.findById(id);
  if (!wine) throw new Error("wine not found");

  const newRating = {
    rating,
    comment,
  };

  wine.ratings.push(newRating);

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
};
