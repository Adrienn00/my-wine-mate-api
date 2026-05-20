const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../user/user.middleware");
const c = require("./social.controller");

// Friend requests
router.get("/friend-requests", authMiddleware, c.getFriendRequests);
router.post("/friend-requests", authMiddleware, c.sendFriendRequest);
router.post("/friend-requests/:requesterId/accept", authMiddleware, c.acceptFriendRequest);
router.delete("/friend-requests/:requesterId", authMiddleware, c.declineFriendRequest);

// Friends
router.get("/friends", authMiddleware, c.getFriends);
router.delete("/friends/:friendId", authMiddleware, c.removeFriend);

// Shared wines
router.post("/wines/:wineId/share", authMiddleware, c.shareWine);
router.get("/shared-wines/inbox", authMiddleware, c.getInbox);
router.get("/shared-wines/sent", authMiddleware, c.getSent);
router.patch("/shared-wines/:id/read", authMiddleware, c.markRead);

module.exports = router;
