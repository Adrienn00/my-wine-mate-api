const socialService = require("./social.service");

async function sendFriendRequest(req, res) {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "username is required" });
    const result = await socialService.sendFriendRequest(req.user.id, username);
    return res.status(200).json(result);
  } catch (err) {
    const clientErrors = ["user not found", "already friends", "request already sent", "this user already sent you a request", "cannot add yourself"];
    const status = clientErrors.includes(err.message) ? 400 : 500;
    return res.status(status).json({ message: err.message });
  }
}

async function acceptFriendRequest(req, res) {
  try {
    const result = await socialService.acceptFriendRequest(req.user.id, req.params.requesterId);
    return res.status(200).json(result);
  } catch (err) {
    if (err.message === "request not found") return res.status(404).json({ message: err.message });
    return res.status(500).json({ message: err.message });
  }
}

async function declineFriendRequest(req, res) {
  try {
    const result = await socialService.declineFriendRequest(req.user.id, req.params.requesterId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function removeFriend(req, res) {
  try {
    await socialService.removeFriend(req.user.id, req.params.friendId);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function getFriends(req, res) {
  try {
    const friends = await socialService.getFriends(req.user.id);
    return res.status(200).json(friends);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function getFriendRequests(req, res) {
  try {
    const requests = await socialService.getFriendRequests(req.user.id);
    return res.status(200).json(requests);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function shareWine(req, res) {
  try {
    const { toUsername, message } = req.body;
    if (!toUsername) return res.status(400).json({ message: "toUsername is required" });
    const result = await socialService.shareWine(req.user.id, req.params.wineId, toUsername, message);
    return res.status(201).json(result);
  } catch (err) {
    const clientErrors = ["user not found", "wine not found", "not a friend", "cannot share with yourself"];
    const status = err.message === "not a friend" ? 403 : clientErrors.includes(err.message) ? 400 : 500;
    return res.status(status).json({ message: err.message });
  }
}

async function getInbox(req, res) {
  try {
    const items = await socialService.getInbox(req.user.id);
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function getSent(req, res) {
  try {
    const items = await socialService.getSent(req.user.id);
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function markRead(req, res) {
  try {
    await socialService.markRead(req.user.id, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriends,
  getFriendRequests,
  shareWine,
  getInbox,
  getSent,
  markRead,
};
