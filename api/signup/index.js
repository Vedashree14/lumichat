const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;  // secure via local.settings.json
const client = new CosmosClient(connectionString);
const database = client.database("chatapp");
const container = database.container("users");

module.exports = async function (context, req) {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        context.res = {
            status: 400,
            body: { error: "Missing fields" }
        };
        return;
    }

    const query = `SELECT * FROM c WHERE c.email = @email`;
    const { resources } = await container.items.query({
        query,
        parameters: [{ name: "@email", value: email }]
    }).fetchAll();

    if (resources.length > 0) {
        context.res = {
            status: 409,
            body: { error: "User already exists" }
        };
        return;
    }

    const newUser = {
        id: email,
        email,
        password,
        name
    };

    await container.items.create(newUser);

    context.res = {
        status: 200,
        body: { status: "User created successfully" }
    };
};
