const { usersContainer } = require("../shared/cosmosClient");
const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req) {
    try {
        try {
            verifyToken(req); // First, verify that the user is logged in
        } catch (authError) {
            context.res = { status: 401, body: { message: authError.message } };
            return;
        }

        const query = "SELECT c.id, c.email, c.name FROM c"; // Don't send passwords to the client
        const { resources } = await usersContainer.items.query(query).fetchAll();

        context.res = {
            status: 200,
            body: resources
        };
    } catch (serverError) {
        context.log.error("getUsers Error:", serverError); // Log the real error
        context.res = {
            status: 500, // This should be a server error, not an auth error
            body: { message: "An internal server error occurred." }
        };
    }

};
