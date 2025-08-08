const Wine = require("./wine.model");

async function getAllWines() {
  return await Wine.find();
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

async function addRating(id, rating, comment) {
  const wine = await Wine.findById(id);
  if (!wine) throw new Error("wine not found");
  const newRating = {
    rating,
    comment,
  };
  wine.ratings.push(newRating);
  await wine.save();
  const updatedWine = await Wine.findById(id); // vagy populate-olt változat, ha kell
  return updatedWine;
}

async function updateWine(id, updatedData) {
  const { _id, _v, ...cleanedUpdatedData } = updatedData;

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
  addNewWine,
  updateWine,
  deleteWine,
  addRating,
};
