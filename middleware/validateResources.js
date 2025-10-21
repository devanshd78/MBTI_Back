// src/validateResource.js
const { StatusCodes } = require('http-status-codes');

function validateResource(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params
    });
    if (!parsed.success) {
      const issues = parsed.error.flatten();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        status: StatusCodes.BAD_REQUEST,
        message: 'Validation failed',
        details: issues
      });
    }
    next();
  };
}

module.exports = { validateResource };
