const wineService = require("../wine/wine.service.js");

async function addRating(req, res) {
  try {
    const { wineName, winery, rating, comment } = req.body;
    const updatedWine = wineService.addRating(wineName, winery, rating, comment);
    if (updatedWine) {
      res.status(200).json(updatedWine);
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error while adding rating", error: err.message });
  }
}

async function getWines(req, res) {
  try {
    const allWines = await wineService.getAllWines();
    res.status(200).json(allWines);
  } catch (err) {
    res.status(500).json({ message: "Error while fetching wine", error: err.message });
  }
}

async function addWine(req, res) {
  try {
    const newWine = await wineService.addNewWine(req.body);
    res.status(201).json(newWine);
  } catch (err) {
    res.status(500).json({ message: "Error while adding wine", error: err.message });
  }
}

async function approveWine(req, res) {
  try {
    const id = req.params.id;
    const approvedWines = await wineService.approveWine(id);
    if (approve) {
      res.status(200).json(approvedWines);
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error while approving wine", error: err.message });
  }
}

async function updateWine(req, res) {
  try {
    const id = req.params.id;
    const updatedWinedata = { ...req.body, id };
    const updatedWine = await wineService.updateWine(updatedWinedata);
    if (updatedWine) {
      res.status(200).json(updatedWine);
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error while updating wine", error: err.message });
  }
}

async function deleteWine(req, res) {
  try {
    const id = req.params.id;
    const deleted = await wineService.deleteWine(id);
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error while deleting wine", error: err.message });
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
