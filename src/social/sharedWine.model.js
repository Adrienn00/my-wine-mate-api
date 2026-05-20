const mongoose = require("mongoose");

const sharedWineSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  wine: { type: mongoose.Schema.Types.ObjectId, ref: "Wine", required: true },
  message: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SharedWine", sharedWineSchema);
