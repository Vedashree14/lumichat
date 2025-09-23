const { messagesContainer, usersContainer } = require("../shared/cosmosClient");
const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req) {
    try {
        const decoded = verifyToken(req);
        const sender = decoded.user.id; // Get sender from the validated token
        const { receiver, message, fileName, fileUrl } = req.body;

        if (!receiver || (!message && !fileUrl)) {
            context.res = {
                status: 400,
                body: { message: "Missing required fields" }
            };
            return;
        }

        const chatId = sender < receiver ? `${sender}-${receiver}` : `${receiver}-${sender}`;

        const newMessage = {
            chatId,
            sender,
            receiver,
            message: message || "",
            timestamp: new Date().toISOString(),
            fileName: fileName || null,
            fileUrl: fileUrl || null
        };

        // Store message in Cosmos DB
        await messagesContainer.items.create(newMessage);

        context.bindings.signalRMessages = [
            {
                // Message for the recipient
                "target": "newMessage",
                "userId": receiver,
                "arguments": [newMessage]
            },
            {
                // Send a copy back to the sender so their UI updates
                "target": "newMessage",
                "userId": sender,
                "arguments": [newMessage]
            }
        ];

        context.res = {
            status: 200,
            body: {
                message: "Message sent successfully",
                newMessage
            }
        };
    } catch (err) {
        context.log.error("SendMessage Error:", err);
        context.res = {
            status: 500,
            body: { message: "Failed to send message.", error: err.message, stack: err.stack }
        };
    }
};
