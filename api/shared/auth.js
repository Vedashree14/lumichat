const jwt = require('jsonwebtoken');

/**
 * 
 * @param {object} req
 * @returns {object} 
 * @throws {Error} 
 */
function verifyToken(req) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        throw new Error('Authorization header is missing, authorization denied');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        throw new Error('Token format is invalid, authorization denied');
    }
    console.log('[AUTH DEBUG] Raw token length:', typeof token === 'string' ? token.length : 'no-token');
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        throw new Error(`Token is not valid. Reason: ${err.message}`);
    }
}

module.exports = { verifyToken };

