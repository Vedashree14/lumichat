const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req, connectionInfo) {
    try {
        // Authenticate the user with their JWT
        const decoded = verifyToken(req);
        const tokenUserId = decoded.user.id;

        // Get the user ID from the header (which the binding uses)
        const headerUserId = req.headers['x-user-id'];

        // Security check: Ensure the user in the token is the one requesting the connection
        if (tokenUserId !== headerUserId) {
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
