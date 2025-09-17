const { verifyToken } = require("../shared/auth");

module.exports = async function (context, req) {
    try {
        const decoded = verifyToken(req);
        const sender = decoded.user.id;
        const { recipient, isTyping } = req.body;

        if (!recipient) {
            context.res = { status: 400, body: { message: "Recipient is required." } };
            return;
        }

        // Use the SignalR output binding to send the typing state to the correct user
        context.bindings.signalRMessages = [{
            "target": "typingStateUpdate",
            "userId": recipient,
            "arguments": [{
                sender: sender,
                isTyping: isTyping
            }]
        }];

        context.res = { status: 200, body: "Typing state sent." };

    } catch (err) {
        context.res = { 
            status: 401, 
            headers: {'Content-Type': 'application/json'},
            body: { message: err.message || 'Authentication failed.' } 
        };
    }
};
