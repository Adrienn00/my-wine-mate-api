const mongoose = require("mongoose");

const pairingTrainingRunSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    triggerSource: {
      type: String,
      enum: ["admin", "system"],
      default: "admin",
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedFeedbackCount: {
      type: Number,
      default: 0,
    },
    pendingFeedbackCount: {
      type: Number,
      default: 0,
    },
    stdout: {
      type: String,
      default: "",
    },
    stderr: {
      type: String,
      default: "",
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PairingTrainingRun", pairingTrainingRunSchema);
