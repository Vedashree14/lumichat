const jwt = require('jsonwebtoken');

function verifyToken(req) {
    // get header case-insensitive
    const headers = req.headers || {};
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader) {
        throw new Error('Authorization header is missing, authorization denied');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
        throw new Error('Token format is invalid, authorization denied');
    }

    const token = parts[1];
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        throw new Error(`Token is not valid. Reason: ${err.message}`);
    }
}

module.exports = { verifyToken };
