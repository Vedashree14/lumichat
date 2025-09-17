const { CosmosClient } = require("@azure/cosmos");

// This client is created once and reused across all function invocations.
const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const client = new CosmosClient(connectionString);

const databaseId = process.env.COSMOS_DB_DATABASE_ID || "chatapp";
const database = client.database(databaseId);

const usersContainer = database.container(process.env.COSMOS_USERS_CONTAINER_ID || "users");
const messagesContainer = database.container(process.env.COSMOS_MESSAGES_CONTAINER_ID || "messages");

module.exports = {
    usersContainer,
    messagesContainer
};
