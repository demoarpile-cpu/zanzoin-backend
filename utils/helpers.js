const crypto = require('crypto');

// Generate random password
const generatePassword = (length = 12) => {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
};

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Paginate results
const paginate = (query, page = 1, limit = 50) => {
    const offset = (page - 1) * limit;
    return `${query} LIMIT ${limit} OFFSET ${offset}`;
};

// Standard success response
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        data,
        message
    });
};

// Standard error response
const errorResponse = (res, message = 'Error', statusCode = 500) => {
    return res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = {
    generatePassword,
    generateOTP,
    paginate,
    successResponse,
    errorResponse
};
