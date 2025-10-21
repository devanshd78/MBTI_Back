// src/middlewares/notFound.js
const { StatusCodes } = require('http-status-codes');

function notFound(_req, res) {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    status: StatusCodes.NOT_FOUND,
    message: 'Route not found'
  });
}

module.exports = { notFound };
