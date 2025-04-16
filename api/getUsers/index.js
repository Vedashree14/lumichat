const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const client = new CosmosClient(connectionString);
const database = client.database("chatapp");
const container = database.container("users");

module.exports = async function (context, req) {
    const query = "SELECT * FROM c";
    const { resources } = await container.items.query(query).fetchAll();

    if (resources.length === 0) {
        context.res = {
            status: 404,
            body: "No users found"
        };
        return;
    }

    context.res = {
        status: 200,
        body: resources
    };
};
