const bcrypt = require("bcryptjs");
const { usersContainer } = require("../shared/cosmosClient");

module.exports = async function (context, req) {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            context.res = {
                status: 400,
                body: { message: "Missing fields" }
            };
            return;
        }

        const query = `SELECT * FROM c WHERE c.email = @email`;
        const { resources } = await usersContainer.items.query({
            query,
            parameters: [{ name: "@email", value: email }]
        }).fetchAll();

        if (resources.length > 0) {
            context.res = {
                status: 409,
                body: { message: "User already exists" }
            };
            return;
        }

        // Hashing the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            id: email,
            email,
            password: hashedPassword,
            name
        };

        await usersContainer.items.create(newUser);

        context.res = {
            status: 200,
            body: { message: "User created successfully" }
        };
    } catch (error) {
        context.log.error("Signup error:", error);
        context.res = {
            status: 500,
            body: { message: "An error occurred during the signup process.", error: error.message, stack: error.stack }
        };
    }
};
