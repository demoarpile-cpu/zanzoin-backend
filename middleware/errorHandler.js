const errorHandler = (err, req, res, next) => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Max 5MB allowed.' });
    }

    // Multer general error
    if (err.name === 'MulterError') {
        return res.status(400).json({ success: false, message: err.message });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired.' });
    }

    // MySQL duplicate entry
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'Duplicate entry. Record already exists.' });
    }

    // Default
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
};

module.exports = errorHandler;
