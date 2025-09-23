const { messagesContainer, usersContainer } = require("../shared/cosmosClient");
const { verifyToken } = require("../shared/auth");

function normalize(val) {
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
}

module.exports = async function (context, req) {
    try {
        const decoded = verifyToken(req);
        const sender = normalize(decoded.user?.email || decoded.user?.id);
        const { receiver: rawReceiver, message, fileName, fileUrl } = req.body;
        const receiver = normalize(rawReceiver);

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
                "target": "newMessage",
                "userId": receiver,
                "arguments": [newMessage]
            },
            {
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
