// src/controllers/question.controller.js
const mongoose = require('mongoose');
const Theme = require('../models/Theme');
const Question = require('../models/Question');

async function bulkUpsertQuestions(req, res) {
  const themeId = req.params.id;
  if (!mongoose.isValidObjectId(themeId)) {
    return res.status(400).json({ success: false, message: 'Invalid theme id' });
  }

  const theme = await Theme.findById(themeId);
  if (!theme) return res.status(404).json({ success: false, message: 'Theme not found' });

  const { pairTitles, questions } = req.body;

  // Apply pairTitles to Theme if sent
  if (pairTitles && Object.keys(pairTitles).length > 0) {
    theme.pairTitles = {
      ...theme.pairTitles,
      ...pairTitles
    };
    await theme.save();
  }

  // Prepare bulk upserts
  const ops = questions.map((q) => ({
    updateOne: {
      filter: { themeId, code: q.code },
      update: {
        $set: {
          themeId,
          code: q.code,
          dimension: q.dimension,
          title: q.title,
          scenario: q.scenario,
          options: q.options,
          scores: q.scores
        }
      },
      upsert: true
    }
  }));

  const result = await Question.bulkWrite(ops, { ordered: false });

  return res.json({
    success: true,
    data: {
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      matched: result.matchedCount || 0
    }
  });
}

async function listQuestionsByTheme(req, res) {
  const themeId = req.params.id;
  if (!mongoose.isValidObjectId(themeId)) {
    return res.status(400).json({ success: false, message: 'Invalid theme id' });
  }

  const dimension = req.query?.dimension;
  const theme = await Theme.findById(themeId).lean();
  if (!theme) return res.status(404).json({ success: false, message: 'Theme not found' });

  const filter = { themeId };
  if (dimension) filter.dimension = dimension;

  const questions = await Question.find(filter).sort({ code: 1 }).lean();

  return res.json({
    success: true,
    data: {
      themeId,
      pairTitles: theme.pairTitles || null,
      questions
    }
  });
}

module.exports = {
  bulkUpsertQuestions,
  listQuestionsByTheme
};
