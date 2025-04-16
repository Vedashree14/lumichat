const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING; // from local.settings.json
const client = new CosmosClient(connectionString);
const database = client.database("chatapp");
const container = database.container("users");

module.exports = async function (context, req) {
    const { email, password } = req.body;

    if (!email || !password) {
        context.res = {
            status: 400,
            body: "Missing fields"
        };
        return;
    }

    // Check if user exists
    const query = `SELECT * FROM c WHERE c.email = @email`;
    const { resources } = await container.items.query({
        query,
        parameters: [{ name: "@email", value: email }]
    }).fetchAll();

    if (resources.length === 0) {
        context.res = {
            status: 404,
            body: "User not found"
        };
        return;
    }

    const user = resources[0];

    // Check password match
    if (user.password !== password) {
        context.res = {
            status: 401,
            body: "Invalid password"
        };
        return;
    }

    context.res = {
        status: 200,
        body: {
            message: "Login successful",
            user: {
                email: user.email,
                name: user.name
            }
        }
    };
};
