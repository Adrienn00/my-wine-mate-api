const wineService = require("../wine/wine.service.js");

function addRating(req, res) {
  const { wineName, rating, comment } = req.body;
  const updatedWine = wineService.addRating(wineName, rating, comment);
  if (updatedWine) {
    res.status(200).json(updatedWine);
  } else {
    res.status(404).json({ message: "Wine Not Found" });
  }
}

function getWines(req, res) {
  const allWines = wineService.getAllWines();
  res.status(200).json(allWines);
}

function addWine(req, res) {
  const newWine = wineService.addNewWine(req.body);
  res.status(201).json(newWine);
}

function approveWine(req, res) {
  const id = parseInt(req.params.id);
  const approve = wineService.approveWine(id);
  if (approve) {
    res.status(200).json(approve);
  } else {
    res.status(404).json({ message: "Wine Not Found" });
  }
}

function updateWine(req, res) {
  const id = parseInt(req.params.id);
  const updatedWinedata = { ...req.body, id };
  const updatedWine = wineService.updateWine(updatedWinedata);
  if (updatedWine) {
    res.status(200).json(updatedWine);
  } else {
    res.status(404).json({ message: "Wine Not Found" });
  }
}

function deleteWine(req, res) {
  const id = parseInt(req.params.id);
  const deleted = wineService.deleteWine(id);
  if (deleted) {
    res.status(204).send();
  } else {
    res.status(404).json({ message: "Wine Not Found" });
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
