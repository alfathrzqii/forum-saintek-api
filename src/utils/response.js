/**
 * Standardized API Response Formatter
 * @param {string} status - 'success' or 'error'
 * @param {string} message - Human readable message
 * @param {any} data - Payload data (optional)
 */
const formatResponse = (status, message, data = null) => {
  const response = { status, message };
  if (data !== null) response.data = data;
  return response;
};

const successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json(formatResponse('success', message, data));
};

module.exports = { successResponse };
