// scripts/seedMbtiPersonalities.js
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const MBTIPersonality = require('../models/MBTIPersonality');

(async function main() {
  const MONGO_URI =
    process.env.MONGODB_URI

  await mongoose.connect(MONGO_URI);

  // Try .js first, then .json
  const jsPath = path.join(__dirname, '../data.js');

  let payload;
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    payload = require(jsPath);
  } catch {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    payload = require(jsonPath);
  }

  // Support ESM default export if present
  if (payload && payload.default) payload = payload.default;

  const entries = Object.entries(payload || {});
  if (!entries.length) {
    console.error('No MBTI entries found in mbtiResults(.js|.json)');
    process.exit(1);
  }

  for (const [type, doc] of entries) {
    const up = {
      type: String(type).toUpperCase(),
      title: doc.title,
      description: doc.description,
      traits: doc.traits || [],
      strengths: doc.strengths || [],
      growth: doc.growth || [],
      idealEnvironments: doc.idealEnvironments || [],
      communicationStyle: doc.communicationStyle || [],
      collaborationTips: doc.collaborationTips || [],
      meta: doc.meta || undefined,
    };

    await MBTIPersonality.findOneAndUpdate(
      { type: up.type },
      up,
      { upsert: true, new: true }
    );
    console.log(`Upserted MBTI profile: ${up.type}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
