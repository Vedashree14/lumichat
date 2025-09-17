/* const API_BASE = "http://localhost:7071/api"; // For local development */
const API_BASE = "/api";

let currentUser = JSON.parse(sessionStorage.getItem("chatUser")) || null;
let selectedUser = null;
let userMap = {};
let typingTimeout = null;
let signalRConnection = null;
const chatToken = sessionStorage.getItem("chatToken");

function logout() {
    sessionStorage.removeItem('chatUser');
    sessionStorage.removeItem('chatToken');
    window.location.href = 'login.html';
}

function showError(message) {
    alert(message);
}

document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("name").value;
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            try {
                const res = await fetch(`${API_BASE}/signup`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await res.json();

                if (res.ok) {
                    alert("Signup successful! Redirecting to login...");
                    window.location.href = "login.html";
                } else {
                    showError(data.message || data.error || "Signup failed.");
                }
            } catch (err) {
                console.error("Signup error:", err);
                showError("Something went wrong. See console for details.");
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("loginEmail").value;
            const password = document.getElementById("loginPassword").value;

            const res = await fetch(`${API_BASE}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();
            if (res.ok) {
                sessionStorage.setItem("chatUser", JSON.stringify(data.user));
                sessionStorage.setItem("chatToken", data.token);
                window.location.href = "chat.html";
            } else {
                showError(data.body || data.message || "Login failed.");
            }
        });
    }

    if (window.location.pathname.endsWith("chat.html")) {
        if (!currentUser || !chatToken) return window.location.href = "login.html";

        const logoutButton = document.getElementById("logoutButton");
        if (logoutButton) {
            logoutButton.onclick = logout;
        }


        const userListEl = document.getElementById("userList");
        const chatHeader = document.getElementById("chatHeader");
        const chatMessages = document.getElementById("chatMessages");
        const messageInput = document.getElementById("messageInput");
        const typingIndicatorEl = document.getElementById("typingIndicator");
        const sendButton = document.getElementById("sendButton");

        if (sendButton) {
            sendButton.addEventListener('click', sendMessage);
        }

        if (messageInput) {
            messageInput.addEventListener('input', () => {
                if (!selectedUser || !signalRConnection) return;

                // If weren't typing before, send a "start typing" event.
                if (!typingTimeout) {
                    fetch(`${API_BASE}/setTypingState`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${chatToken}` },
                        body: JSON.stringify({ recipient: selectedUser.email, isTyping: true })
                    }).catch(err => console.error("Error sending typing state:", err));

                } else {
                    // If are still typing, clear the old timeout.
                    clearTimeout(typingTimeout);
                }

                // Set a new timeout. If the user stops typing for 2 seconds,
                // Send a "stopped typing" event.
                typingTimeout = setTimeout(() => {
                    fetch(`${API_BASE}/setTypingState`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${chatToken}` },
                        body: JSON.stringify({ recipient: selectedUser.email, isTyping: false })
                    }).catch(err => console.error("Error sending typing state:", err))
                    .finally(() => {
                        typingTimeout = null; 
                    });

                }, 2000);
            });
        }

        async function connectToSignalR() {
            try {
                const connectionInfoRes = await fetch(`${API_BASE}/negotiate`, {
                    method: "POST",
                    headers: {
                        'Authorization': `Bearer ${chatToken}`,
                        'x-user-id': currentUser.email
                    }
                });
                const connectionInfo = await connectionInfoRes.json();

                signalRConnection = new signalR.HubConnectionBuilder()
                    .withUrl(connectionInfo.url, {
                        accessTokenFactory: () => connectionInfo.accessToken
                    })
                    .withAutomaticReconnect()
                    .build();

                signalRConnection.on("newMessage", (message) => {
                    // Only render the message if it belongs to the currently active chat
                    if (selectedUser && (message.sender === selectedUser.email || message.receiver === selectedUser.email)) {
                        renderMessage(message);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                });
                
                signalRConnection.on("typingStateUpdate", (data) => {
                    // Only show indicator if it's from the currently selected user
                    if (selectedUser && data.sender === selectedUser.email) {
                        if (data.isTyping) {
                            typingIndicatorEl.textContent = `${selectedUser.name} is typing...`;
                        } else {
                            typingIndicatorEl.textContent = "";
                        }
                    }
                });
                
                await signalRConnection.start();
                console.log("SignalR Connected.");

            } catch (e) {
                console.error("SignalR connection failed: ", e);
            }
        }

        function renderMessage(msg) {
            const msgDiv = document.createElement("div");
            msgDiv.classList.add("message", msg.sender === currentUser.email ? "sent" : "received");
            const senderName = userMap[msg.sender] || msg.sender;

            let messageHTML = '';
            if (msg.message) {
                messageHTML += document.createTextNode(msg.message).textContent;
            }
            if (msg.fileUrl) {
                messageHTML += ` <a href="${msg.fileUrl}" target="_blank" download>📎 ${msg.fileName || "File"}</a>`;
            }

            msgDiv.innerHTML = `<strong>${senderName}:</strong> ${messageHTML}`;
            chatMessages.appendChild(msgDiv);
        }

        async function loadUsers() {
            const res = await fetch(`${API_BASE}/getUsers`, {
                headers: {
                    'Authorization': `Bearer ${chatToken}`
                }
            });
            const users = await res.json();

            userMap = {};
            userListEl.innerHTML = "";
            users.forEach(user => {
                userMap[user.email] = user.name;
                if (user.email !== currentUser.email) {
                    const btn = document.createElement("button");
                    btn.textContent = user.name;
                    btn.classList.add("user-button");
                    btn.onclick = () => {
                        // If we were typing to the old user, send a stop event
                        if (typingTimeout && selectedUser) {
                            clearTimeout(typingTimeout);
                            fetch(`${API_BASE}/setTypingState`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${chatToken}` },
                                body: JSON.stringify({ recipient: selectedUser.email, isTyping: false })
                            }).catch(err => console.error("Error sending typing state:", err));
                            typingTimeout = null; 
                        }

                        selectedUser = user;
                        chatHeader.innerText = `Chat with ${user.name}`;

                        document.getElementById('chat-placeholder').style.display = 'none';
                        document.getElementById('chatMessages').style.display = 'block';
                        document.querySelector('.message-input-area').style.display = 'flex';
                        document.querySelector('.typing-indicator').style.display = 'block';

                        typingIndicatorEl.textContent = ""; // Clear indicator for new chat
                        chatMessages.innerHTML = "";
                        loadMessageHistory();

                    };
                    userListEl.appendChild(btn);
                }
            });
        }

        async function loadMessageHistory() {
            if (!selectedUser) return;
            try {
                const res = await fetch(`${API_BASE}/getMessage?receiver=${selectedUser.email}`, {
                    headers: {
                        'Authorization': `Bearer ${chatToken}`
                    }
                });

                const messageHistory = await res.json();
                messageHistory.forEach(renderMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;

            } catch (err) {
                console.error("Failed to load message history:", err);
            }
        }

        async function sendMessage() {
            const text = document.getElementById("messageInput").value;
            const file = document.getElementById("fileInput").files[0];

            if (!selectedUser || (!text && !file)) return;
            

            try {
                let fileName = file ? file.name : null;
                let fileUrl = null;
                const tempId = Date.now();

                if (file) {
                    const uploadingMsg = document.createElement("div");
                    uploadingMsg.classList.add("message", "sent");
                    uploadingMsg.id = `temp-${tempId}`;
                    uploadingMsg.innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> Uploading "${file.name}"...`;
                    chatMessages.appendChild(uploadingMsg);
                    chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to see it

                    try {
                        const formData = new FormData();
                        formData.append("file", file);

                        const res = await fetch(`${API_BASE}/uploadFile`, {
                            method: "POST",
                            headers: { 'Authorization': `Bearer ${chatToken}` },
                            body: formData
                        });

                        if (!res.ok) throw new Error("Upload failed");
                        const data = await res.json();

                        if (data && data.url) {
                            fileUrl = data.url;
                        } else {
                            throw new Error("Upload response invalid");
                        }
                    } catch (error) {
                        console.error("Upload error:", error);
                        const tempMsg = document.getElementById(`temp-${tempId}`);
                        if (tempMsg) {
                            tempMsg.innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> ❌ Upload failed`;
                        }
                        return; // Exit here, finally block will still run
                    }

                    // Safely remove the "Uploading..." message
                    const tempMsg = document.getElementById(`temp-${tempId}`);
                    if (tempMsg) {
                        tempMsg.remove();
                    }
                }

                await fetch(`${API_BASE}/sendMessage`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${chatToken}`
                    },
                    body: JSON.stringify({
                        message: text,
                        receiver: selectedUser.email,
                        fileName,
                        fileUrl
                    })
                });

                document.getElementById("messageInput").value = "";
                document.getElementById("fileInput").value = "";
            } catch (error) {
                console.error("Send message failed:", error);
                showError("Failed to send your message. Please try again.");
            }
        };

        loadUsers();
        connectToSignalR();

    }
});
