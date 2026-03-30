const wineService = require("../wine/wine.service.js");
const liveOffersService = require("../wine/liveOffers.service.js");
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
    const { rating, comment, criteria } = req.body || {};
    const updateRatings = await wineService.addRating(id, {
      rating,
      comment,
      criteria,
      userId: req.user?.id,
    });

    const latestRating = updateRatings?.ratings?.[updateRatings.ratings.length - 1];
    const hasComment = String(latestRating?.comment || "").trim().length > 0;

    if (hasComment) {
      const commenter = latestRating?.userName || req.user?.email || "Egy felhasználó";
      const admins = await User.find({
        isAdmin: true,
        _id: { $ne: req.user?.id },
      }).select("_id notifications");

      await Promise.all(
        admins.map(async (admin) => {
          admin.notifications.push({
            message: `Új hozzászólás érkezett a "${updateRatings.name}" borhoz (${commenter}).`,
            type: "moderation",
            link: `/wine/${updateRatings._id}`,
          });
          await admin.save();
        })
      );
    }

    if (updateRatings) {
      res.status(200).json(updateRatings);
    } else {
      res.status(404).json({ message: "Wine Not Found" });
    }
  } catch (err) {
    const statusCode = err.message === "A valid rating is required." ? 400 : 500;
    res.status(statusCode).json({ message: "Error while updating ratings", error: err.message });
  }
}

async function removeRating(req, res) {
  try {
    const id = req.params.id;
    const ratingId = req.params.ratingId;
    const updatedWine = await wineService.deleteRating(id, ratingId);
    return res.status(200).json(updatedWine);
  } catch (err) {
    if (err.message === "wine not found") {
      return res.status(404).json({ message: "Wine Not Found" });
    }
    if (err.message === "rating not found") {
      return res.status(404).json({ message: "Rating Not Found" });
    }
    return res.status(500).json({ message: "Error while deleting rating", error: err.message });
  }
}

async function getLiveOffers(req, res) {
  try {
    const id = req.params.id;
    const wine = await wineService.getWineById(id);

    if (!wine) {
      return res.status(404).json({ message: "Wine Not Found" });
    }

    const result = await liveOffersService.fetchLiveOffers({
      wineName: wine.name,
      winery: wine.winery,
    });

    return res.status(200).json({
      wineId: wine._id,
      wineName: wine.name,
      source: result.source,
      stale: result.stale,
      offers: result.offers,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error while fetching live offers", error: err.message });
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
      if (updatedData.is_confirmed === true) {
        user.notifications.push({
          message: `Your wine "${updatedWine.name}" has been approved.`,
          type: "approved",
        });
      }

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
  removeRating,
  getLiveOffers,
};
