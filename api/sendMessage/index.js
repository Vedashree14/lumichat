const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const client = new CosmosClient(connectionString);
const database = client.database("chatapp");
const container = database.container("messages");

module.exports = async function (context, req) {
    const { sender, receiver, message } = req.body;

    if (!sender || !receiver || !message) {
        context.res = {
            status: 400,
            body: "Missing required fields"
        };
        return;
    }

    const chatId = sender < receiver ? `${sender}-${receiver}` : `${receiver}-${sender}`;

    const newMessage = {
        chatId,
        sender,
        receiver,
        message,
        timestamp: new Date().toISOString()
    };

    // Store message in Cosmos DB
    await container.items.create(newMessage);

    context.res = {
        status: 200,
        body: {
            message: "Message sent successfully",
            newMessage
        }
    };
};
