// src/middlewares/errorHandler.js
const { StatusCodes } = require('http-status-codes');
const { ApiError } = require('../utils/APIError');

function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      status: err.status,
      message: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }
  console.error('Unhandled Error:', err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    status: StatusCodes.INTERNAL_SERVER_ERROR,
    message: 'Internal Server Error'
  });
}

module.exports = { errorHandler };
