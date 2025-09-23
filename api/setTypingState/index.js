const { verifyToken } = require("../shared/auth");

function normalize(val) {
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
}

module.exports = async function (context, req) {
    try {
        const decoded = verifyToken(req);
        const sender = normalize(decoded.user?.email || decoded.user?.id);
        const { recipient: rawRecipient, isTyping } = req.body;
        const recipient = normalize(rawRecipient);

        if (!recipient) {
            context.res = { status: 400, body: { message: "Recipient is required." } };
            return;
        }

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
        context.log.error("SetTypingState Error:", err);
        context.res = { status: 500, body: { message: "Failed to set typing state.", error: err.message, stack: err.stack } };
    }
};
