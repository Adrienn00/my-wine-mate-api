const wineService = require("../wine/wine.service.js");

function addRating(req, res) {
  const { wineName, rating, comment } = req.body;
  const updatedWine = wineService.addRating(wineName, rating, comment);
  if (updatedWine) {
    res.json(updatedWine);
  } else {
    res.json({ message: "Bor nem található" });
  }
}

function getWines(req, res) {
  const allWines = wineService.getAllWines();
  res.json(allWines);
}

function addWine(req, res) {
  const newWine = wineService.addNewWine(req.body);
  res.json(newWine);
}

function approveWine(req, res) {
  const id = parseInt(req.params.id);
  const approve = wineService.approveWine(id);
  if (approve) {
    res.json(approve);
  } else {
    res.json({ message: "Bor nem található" });
  }
}

function updateWine(req, res) {
  const id = parseInt(req.params.id);
  const updatedWinedata = { ...req.body, id };
  const updatedWine = wineService.updateWine(updatedWinedata);
  if (updatedWine) {
    res.json(updatedWine);
  } else {
    res.json({ message: "Bor nem található" });
  }
}

function deleteWine(req, res) {
  const id = parseInt(req.params.id);
  const deleted = wineService.deleteWine(id);
  if (deleted) {
    res.send();
  } else {
    res.json({ message: "Bor nem található" });
  }
}

module.exports = {
  addRating,
  getWines,
  addWine,
  approveWine,
  updateWine,
  deleteWine,
};
