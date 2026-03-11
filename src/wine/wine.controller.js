const wineService = require("../wine/wine.service.js");
const User = require("../user/user.model");

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
    const wineData = {
      ...req.body,
      createdBy: req.user.id,
      isConfirmed: req.user.isAdmin ? true : false,
    };

    const wine = await wineService.addWine(wineData);

    res.status(201).json(wine);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function newRating(req, res) {
  try {
    const id = req.params.id;
    const { rating, comment } = req.body;
    const updateRatings = await wineService.addRating(id, rating, comment);
    if (updateRatings) {
      res.status(200).json(updateRatings);
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    res.status(500).json({ message: "Error while updating ratings", error: err.message });
  }
}

async function updateWine(req, res) {
  try {
    const id = req.params.id;
    const updatedData = req.body;

    const updatedWine = await wineService.updateWine(id, updatedData);

    if (!updatedWine) {
      return res.status(404).json({ message: "Wine Not Found" });
    }

    const user = await User.findById(updatedWine.createdBy);

    if (user) {
      // APPROVED
      if (updatedData.is_confirmed === true) {
        user.notifications.push({
          message: `Your wine "${updatedWine.name}" has been approved.`,
          type: "approved",
        });
      }

      // REJECTED
      if (updatedData.rejectionReason) {
        user.notifications.push({
          message: `Your wine "${updatedWine.name}" was rejected. Reason: ${updatedData.rejectionReason}`,
          type: "rejected",
        });
      }

      await user.save();
    }

    res.status(200).json(updatedWine);
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
    res.status(500).json({
      message: "Error while deleting wine",
      error: err.message,
    });
  }
}
module.exports = {
  getWines,
  addWine,
  updateWine,
  deleteWine,
  newRating,
};
