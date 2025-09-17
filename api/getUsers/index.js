const { usersContainer } = require("../shared/cosmosClient");
const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req) {
    try {
        verifyToken(req); // Just verify that the user is logged in

        const query = "SELECT c.id, c.email, c.name FROM c"; // Don't send passwords to the client
        const { resources } = await usersContainer.items.query(query).fetchAll();

        context.res = {
            status: 200,
            body: resources
        };
    } catch (err) {
        context.res = {
            status: 401,
            body: err.message
        };
    }

};
