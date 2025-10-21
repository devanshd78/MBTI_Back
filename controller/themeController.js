// src/controllers/theme.controller.js
const { isValidObjectId } = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Theme = require('../models/Theme');
const { ok } = require('../utils/APIResponse');
const { ApiError } = require('../utils/APIError');

async function createTheme(req, res) {
  const doc = await Theme.create(req.body);
  res.status(StatusCodes.CREATED).json(ok(doc));
}

async function getThemeBySlug(req, res) {
  const { slug } = req.params;
  const doc = await Theme.findOne({ slug }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Theme not found' });
  res.json({ success: true, data: doc });
}

async function listThemes(req, res) {
  const { page = '1', limit = '10', sort = '-createdAt', q, isActive } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const filter = {};
  if (typeof isActive !== 'undefined') {
    filter.isActive = isActive === 'true' || isActive === '1';
  }
  if (q) {
    const regex = new RegExp(q, 'i');
    filter.$or = [{ title: regex }, { description: regex }, { features: regex }];
  }

  const parseSort = (s) =>
    String(s)
      .split(',')
      .reduce((acc, part) => {
        const [keyRaw, dirRaw] = part.split(':');
        const key = keyRaw.trim();
        const dir = (dirRaw?.trim() || (key.startsWith('-') ? 'desc' : 'asc')).toLowerCase();
        const cleanKey = key.replace(/^-/, '');
        acc[cleanKey] = dir === 'desc' ? -1 : 1;
        return acc;
      }, {});
  const sortObj = parseSort(sort);

  const [items, total] = await Promise.all([
    Theme.find(filter).sort(sortObj).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Theme.countDocuments(filter)
  ]);

  res.json(
    ok(items, {
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    })
  );
}

async function getThemeById(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');
  }
  const doc = await Theme.findById(id);
  if (!doc) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Theme not found');
  }
  res.json(ok(doc));
}

async function updateTheme(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');
  }
  const doc = await Theme.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!doc) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Theme not found');
  }
  res.json(ok(doc));
}

async function deleteTheme(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');
  }
  const doc = await Theme.findByIdAndDelete(id);
  if (!doc) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Theme not found');
  }
  res.status(StatusCodes.NO_CONTENT).send();
}

module.exports = { createTheme, listThemes, getThemeById, updateTheme, deleteTheme, getThemeBySlug };
