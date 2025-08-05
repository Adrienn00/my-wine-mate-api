const Wine = require("./wine.model");

async function getAllWines() {
  return await Wine.find();
}

async function addRating(wineName, winery, rating, comment) {
  const wine = await Wine.findOne({ name: wineName, winery: winery });
  if (wine) {
    wine.ratings.push({ rating, comment });
    await wine.save();
    return wine;
  }
  return null;
}

async function addNewWine(wine) {
  const newWine = new Wine({
    ...wine,
    ratings: [],
    is_confirmed: wine.is_confirmed ?? false,
  });
  await newWine.save();
  return newWine;
}

async function approveWine(id) {
  const wine = await Wine.findOne({ _id: id });
  if (wine) {
    wine.is_confirmed = true;
    await wine.save();
    return wine;
  }
  return null;
}

async function updateWine(updatedWine) {
  const wine = await Wine.findById(updatedWine.id);
  if (!wine) return null;
  Object.assign(wine, updatedWine, { is_confirmed: true });
  await wine.save();
  return wine;
}

async function deleteWine(id) {
  const result = await Wine.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

module.exports = {
  getAllWines,
  addNewWine,
  approveWine,
  updateWine,
  deleteWine,
  addRating,
};
