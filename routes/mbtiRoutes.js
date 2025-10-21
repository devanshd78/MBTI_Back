const express = require('express');
const router = express.Router();

const {
  getAllResults,
  getResultByType,
  bulkUpsertPersonalities,
  seedFromFile,
  shareByTypeEmail
} = require('../controller/mbtiController');

// Public
router.get('/results', getAllResults);
router.get('/results/:type', getResultByType);

// Optional admin utilities (protect in middleware if needed)
router.post('/results/bulk', bulkUpsertPersonalities);
router.post('/seed', seedFromFile);
router.post('/:type/share-email', shareByTypeEmail);

module.exports = router;
