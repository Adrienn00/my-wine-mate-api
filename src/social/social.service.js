const User = require("../user/user.model");
const Wine = require("../wine/wine.model");
const SharedWine = require("./sharedWine.model");

async function sendFriendRequest(senderId, targetUsername) {
  const sender = await User.findById(senderId).select("username friends friendRequests");
  const target = await User.findOne({ username: targetUsername }).select("_id username friends friendRequests notifications");

  if (!target) throw new Error("user not found");
  if (target._id.toString() === senderId) throw new Error("cannot add yourself");

  const alreadyFriends = sender.friends.some((id) => id.toString() === target._id.toString());
  if (alreadyFriends) throw new Error("already friends");

  const alreadyRequested = target.friendRequests.some((r) => r.from.toString() === senderId);
  if (alreadyRequested) throw new Error("request already sent");

  const theyAlreadySentRequest = sender.friendRequests.some((r) => r.from.toString() === target._id.toString());
  if (theyAlreadySentRequest) throw new Error("this user already sent you a request");

  target.friendRequests.push({ from: senderId });
  target.notifications.push({
    message: `${sender.username} sent you a friend request.`,
    type: "friend_request",
    link: "/social",
  });
  await target.save();

  return { message: "Friend request sent." };
}

async function acceptFriendRequest(userId, requesterId) {
  const user = await User.findById(userId);
  const requester = await User.findById(requesterId).select("friends username notifications");

  if (!user || !requester) throw new Error("user not found");

  const reqIndex = user.friendRequests.findIndex((r) => r.from.toString() === requesterId);
  if (reqIndex === -1) throw new Error("request not found");

  user.friendRequests.splice(reqIndex, 1);

  if (!user.friends.includes(requesterId)) user.friends.push(requesterId);
  if (!requester.friends.includes(userId)) requester.friends.push(userId);

  requester.notifications.push({
    message: `${user.username} accepted your friend request.`,
    type: "friend_accepted",
    link: "/social",
  });

  await Promise.all([user.save(), requester.save()]);
  return { message: "Friend request accepted." };
}

async function declineFriendRequest(userId, requesterId) {
  await User.findByIdAndUpdate(userId, {
    $pull: { friendRequests: { from: requesterId } },
  });
  return { message: "Request declined." };
}

async function removeFriend(userId, friendId) {
  await Promise.all([
    User.findByIdAndUpdate(userId, { $pull: { friends: friendId } }),
    User.findByIdAndUpdate(friendId, { $pull: { friends: userId } }),
  ]);
}

async function getFriends(userId) {
  const user = await User.findById(userId).populate("friends", "username firstName lastName");
  if (!user) throw new Error("User not found");
  return user.friends;
}

async function getFriendRequests(userId) {
  const user = await User.findById(userId).populate("friendRequests.from", "username firstName lastName");
  if (!user) throw new Error("User not found");
  return user.friendRequests;
}

async function shareWine(senderId, wineId, toUsername, message = "") {
  const sender = await User.findById(senderId).select("friends username");
  const target = await User.findOne({ username: toUsername }).select("_id username notifications");
  const wine = await Wine.findById(wineId).select("name");

  if (!target) throw new Error("user not found");
  if (!wine) throw new Error("wine not found");
  if (target._id.toString() === senderId) throw new Error("cannot share with yourself");

  const isFriend = sender.friends.some((id) => id.toString() === target._id.toString());
  if (!isFriend) throw new Error("not a friend");

  const shared = await SharedWine.create({
    from: senderId,
    to: target._id,
    wine: wineId,
    message,
  });

  target.notifications.push({
    message: `${sender.username} shared a wine with you: "${wine.name}"`,
    type: "share",
    link: `/wine/${wine._id}`,
  });
  await target.save();

  return shared;
}

async function getInbox(userId) {
  return SharedWine.find({ to: userId })
    .populate("from", "username firstName lastName")
    .populate("wine", "name type winery imageUrl")
    .sort({ createdAt: -1 });
}

async function getSent(userId) {
  return SharedWine.find({ from: userId })
    .populate("to", "username firstName lastName")
    .populate("wine", "name type winery imageUrl")
    .sort({ createdAt: -1 });
}

async function markRead(userId, sharedWineId) {
  await SharedWine.findOneAndUpdate({ _id: sharedWineId, to: userId }, { read: true });
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
