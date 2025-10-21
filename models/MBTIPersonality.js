// src/models/MBTIPersonality.js
const { Schema, model } = require('mongoose');

const MBTIPersonalitySchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      unique: true,
      trim: true, // e.g., "INTJ"
      uppercase: true,
    },
    title: String,
    description: String,
    traits: [String],
    strengths: [String],
    growth: [String],
    idealEnvironments: [String],
    communicationStyle: [String],
    collaborationTips: [String],
    // for future expansion:
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = model('MBTIPersonality', MBTIPersonalitySchema);
