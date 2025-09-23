const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { usersContainer } = require("../shared/cosmosClient");

module.exports = async function (context, req) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            context.res = {
                status: 400,
                body: { message: "Missing email or password." }
            };
            return;
        }

        // Check if user exists
        const query = `SELECT * FROM c WHERE c.email = @email`;
        const { resources } = await usersContainer.items.query({
            query,
            parameters: [{ name: "@email", value: email }]
        }).fetchAll();

        if (resources.length === 0) {
            context.res = {
                status: 401,
                body: { message: "Invalid credentials." }
            };
            return;
        }

        const user = resources[0];
        let isMatch = false;

        const isHashed = user.password && user.password.startsWith('$2');

        if (isHashed) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            if (user.password === password) {
                isMatch = true;
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                const updatedUser = { ...user, password: hashedPassword };
                await usersContainer.item(user.id, user.email).replace(updatedUser);
                context.log(`Upgraded password for user: ${email}`);
            }
        }

        if (!isMatch) {
            context.res = {
                status: 401,
                body: { message: "Invalid credentials." }
            };
            return;
        }

        // Create and sign JWT - include email explicitly
        const payload = {
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '3h'
        });

        context.res = {
            status: 200,
            body: {
                message: "Login successful",
                token,
                user: {
                    email: user.email,
                    name: user.name
                }
            }
        };
    } catch (error) {
        context.log.error("Login Error:", error);
        context.res = {
            status: 500,
            body: { message: "An error occurred during the login process.", error: error.message, stack: error.stack }
        };
    }
};
