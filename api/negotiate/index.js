const { verifyToken } = require("../shared/auth");

function normalize(val) {
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
}

module.exports = async function (context, req, connectionInfo) {
    try {
        const decoded = verifyToken(req);
        // token may contain email in user.email or user.id
        const tokenUserId = normalize(decoded.user?.email || decoded.user?.id);

        // Get the user ID from the header (which the binding uses)
        const headerUserId = normalize(req.headers['x-user-id']);

        // Security check: Ensure the user in the token is the one requesting the connection
        if (!tokenUserId || !headerUserId || tokenUserId !== headerUserId) {
            context.res = { status: 401, body: { message: "User ID mismatch." } };
            return;
        }

        // If authentication is successful, return the connection info
        context.res = {
            body: connectionInfo
        };
    } catch (err) {
        context.log.error("Negotiate Error:", err);
        context.res = {
            status: 401,
            body: { message: "Authentication failed.", error: err.message, stack: err.stack }
        };
    }
};
