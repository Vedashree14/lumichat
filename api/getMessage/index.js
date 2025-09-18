const { messagesContainer } = require("../shared/cosmosClient");
const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req) {
    try {
        const decoded = verifyToken(req);
        const sender = decoded.user.id; // Get sender from the validated token
        const { receiver } = req.query;

        if (!receiver) {
            context.res = {
                status: 400,
                body: { message: "Missing receiver" }
            };
            return;
        }

        const chatId = sender < receiver ? `${sender}-${receiver}` : `${receiver}-${sender}`;
        const query = `SELECT * FROM c WHERE c.chatId = @chatId ORDER BY c.timestamp`;
        const { resources } = await messagesContainer.items.query({
            query,
            parameters: [{ name: "@chatId", value: chatId }]
        }).fetchAll();

        context.res = {
            status: 200,
            body: resources
        };
    } catch (err) {
        context.log.error("GetMessage Error:", err);
        context.res = {
            status: 500,
            body: { message: "Failed to retrieve messages.", error: err.message, stack: err.stack }
        };
    }
};
