const wineService = require("../wine/wine.service.js");

const addRating = (req, res) => {
  const { wineName, rating, comment } = req.body;
  const updatedWine = wineService.addRating(wineName, rating, comment);
  if (updatedWine) {
    res.json(updatedWine);
  } else {
    res.json({ message: "Bor nem talalhato" });
  }
};
const getWines = (req, res) => {
  const allWines = wineService.getAllWines();
  res.json(allWines);
};

const addWine = (req, res) => {
  const newWine = wineService.addNewWine(req.body);
  res.json(newWine);
};

const approveWine = (req, res) => {
  const id = parseInt(req.params.id);
  const approve = wineService.approveWine(id);
  if (approve) {
    res.json(approve);
  } else {
    res.json({ message: "Bor nem talalhato" });
  }
};

const updateWine = (req, res) => {
  const id = parseInt(req.params.id);
  const updatedWinedata = { ...req.body, id };
  const updatedWine = wineService.updateWine(updatedWinedata);
  if (updatedWine) {
    res.json(updatedWine);
  } else {
    res.json({ message: "Bor nem talalhato" });
  }
};
const deleteWine = (req, res) => {
  const id = parseInt(req.params.id);
  const deleted = wineService.deleteWine(id);
  if (deleted) {
    res.send();
  } else {
    res.json({ message: "Bor nem talalhato" });
  }
};

module.exports = {
  addRating,
  getWines,
  addWine,
  approveWine,
  rejectWine,
  updateWine,
  deleteWine,
};
