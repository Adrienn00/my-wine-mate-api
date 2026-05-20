const wineService = require("../wine/wine.service.js");
const liveOffersService = require("../wine/liveOffers.service.js");
const wineOcrService = require("../wine/wineOcr.service.js");
const wineEnrichService = require("../wine/wineEnrich.service.js");
const User = require("../user/user.model");

async function getWines(req, res) {
  try {
    const allWines = await wineService.getAllWines();
    res.status(200).json(allWines);
  } catch (err) {
    res.status(500).json({ message: "Error while fetching wine", error: err.message });
  }
}

async function getWineById(req, res) {
  try {
    const wine = await wineService.getWineById(req.params.id);
    if (!wine) {
      return res.status(404).json({ message: "Wine Not Found" });
    }
    return res.status(200).json(wine);
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
      const commenter = latestRating?.userName || req.user?.email || "A user";
      const admins = await User.find({
        isAdmin: true,
        _id: { $ne: req.user?.id },
      }).select("_id notifications");

      await Promise.all(
        admins.map(async (admin) => {
          admin.notifications.push({
            message: `A new comment was added to the wine "${updateRatings.name}" by ${commenter}.`,
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

async function ocrScan(req, res) {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ message: "Missing image field (base64 string)." });
    }
    const result = await wineOcrService.extractWineLabelFromImage(image, mimeType || "image/jpeg");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ message: "OCR failed.", error: err.message });
  }
}

async function shareWine(req, res) {
  try {
    const { targetUsername } = req.body;
    if (!targetUsername) {
      return res.status(400).json({ message: "targetUsername is required" });
    }
    const result = await wineService.shareWineWithUser(req.params.id, req.user, targetUsername);
    return res.status(200).json(result);
  } catch (err) {
    if (err.message === "wine not found") return res.status(404).json({ message: "Wine not found" });
    if (err.message === "target user not found") return res.status(404).json({ message: "Target user not found" });
    if (err.message === "cannot share with yourself") return res.status(400).json({ message: err.message });
    if (err.message === "not a friend") return res.status(403).json({ message: "You can only share with friends." });
    return res.status(500).json({ message: "Error while sharing wine", error: err.message });
  }
}

async function aiEnrich(req, res) {
  try {
    const { name, winery, year, region, type } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Missing required field: name." });
    }
    const result = await wineEnrichService.enrichWineWithAI({ name, winery, year, region, type });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ message: "AI enrich failed.", error: err.message });
  }
}

module.exports = {
  getWines,
  getWineById,
  addWine,
  updateWine,
  deleteWine,
  newRating,
  removeRating,
  getLiveOffers,
  ocrScan,
  aiEnrich,
  shareWine,
};
