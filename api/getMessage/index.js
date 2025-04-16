const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const client = new CosmosClient(connectionString);
const database = client.database("chatapp");
const container = database.container("messages");

module.exports = async function (context, req) {
    const { sender, receiver } = req.query;

    if (!sender || !receiver) {
        context.res = {
            status: 400,
            body: "Missing sender or receiver"
        };
        return;
    }

    const chatId = sender < receiver ? `${sender}-${receiver}` : `${receiver}-${sender}`;
    const query = `SELECT * FROM c WHERE c.chatId = @chatId ORDER BY c.timestamp`;
    const { resources } = await container.items.query({
        query,
        parameters: [{ name: "@chatId", value: chatId }]
    }).fetchAll();

    if (resources.length === 0) {
        context.res = {
            status: 404,
            body: "No messages found"
        };
        return;
    }

    context.res = {
        status: 200,
        body: resources
    };
};
