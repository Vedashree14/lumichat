// const API_BASE = "http://localhost:7071/api"; // For local development
const API_BASE = "/api";

let currentUser = JSON.parse(sessionStorage.getItem("chatUser")) || null;
let selectedUser = null;
let userMap = {};
let signalRConnection = null;
let typingTimeout = null;

function logout() {
    sessionStorage.removeItem("chatUser");
    sessionStorage.removeItem("chatToken");
    window.location.href = "login.html";
}

function showError(message) {
    alert(message);
}

// ----------------- API Helper -----------------
async function handleApiResponse(res) {
    if (res.status === 401) {
        alert("Session expired. Please log in again.");
        logout();
        return null;
    }
    try {
        return await res.json();
    } catch {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    // ----------------- SIGNUP -----------------
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

                const data = await handleApiResponse(res);
                if (res.ok) {
                    alert("Signup successful! Redirecting to login...");
                    window.location.href = "login.html";
                } else {
                    showError(data?.message || "Signup failed.");
                }
            } catch (err) {
                console.error("Signup error:", err);
                showError("Something went wrong. See console for details.");
            }
        });
    }

    // ----------------- LOGIN -----------------
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("loginEmail").value;
            const password = document.getElementById("loginPassword").value;

            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });

                const data = await handleApiResponse(res);
                
                if (res.ok) {
                    sessionStorage.clear();
                    sessionStorage.setItem("chatUser", JSON.stringify(data.user));
                    sessionStorage.setItem("chatToken", data.token);
                    window.location.href = "chat.html";
                } else {
                    showError(data?.message || "Login failed.");
                }
            } catch (err) {
                console.error("Login error:", err);
                showError("Something went wrong. See console for details.");
            }
        });
    }

    // ----------------- CHAT -----------------
    if (window.location.pathname.endsWith("chat.html")) {
        if (!currentUser || !sessionStorage.getItem("chatToken")) {
            return (window.location.href = "login.html");
        }

        const logoutButton = document.getElementById("logoutButton");
        if (logoutButton) logoutButton.onclick = logout;

        const userListEl = document.getElementById("userList");
        const chatHeader = document.getElementById("chatHeader");
        const chatMessages = document.getElementById("chatMessages");
        const messageInput = document.getElementById("messageInput");
        const typingIndicatorEl = document.getElementById("typingIndicator");
        const sendButton = document.getElementById("sendButton");

        if (sendButton) sendButton.addEventListener("click", sendMessage);

        // ---------- Typing State ----------
        if (messageInput) {
            messageInput.addEventListener("input", () => {
                if (!selectedUser || !signalRConnection) return;

                if (!typingTimeout) {
                    fetch(`${API_BASE}/setTypingState`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                        },
                        body: JSON.stringify({ recipient: selectedUser.email, isTyping: true })
                    }).catch(err => console.error("Error sending typing state:", err));
                } else {
                    clearTimeout(typingTimeout);
                }

                typingTimeout = setTimeout(() => {
                    fetch(`${API_BASE}/setTypingState`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                        },
                        body: JSON.stringify({ recipient: selectedUser.email, isTyping: false })
                    }).catch(err => console.error("Error sending typing state:", err))
                      .finally(() => { typingTimeout = null; });
                }, 2000);
            });
        }

        // ---------- SignalR ----------
        async function connectToSignalR() {
            try {
                const res = await fetch(`${API_BASE}/negotiate`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`,
                        "x-user-id": currentUser.email
                    }
                });

                const connectionInfo = await handleApiResponse(res);
                if (!connectionInfo?.url || !connectionInfo?.accessToken) {
                    console.error("SignalR negotiation failed:", connectionInfo);
                    return;
                }

                signalRConnection = new signalR.HubConnectionBuilder()
                    .withUrl(connectionInfo.url, { accessTokenFactory: () => connectionInfo.accessToken })
                    .withAutomaticReconnect()
                    .build();

                signalRConnection.on("newMessage", (message) => {
                    if (selectedUser &&
                        (message.sender === selectedUser.email || message.receiver === selectedUser.email)) {
                        renderMessage(message);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                });

                signalRConnection.on("typingStateUpdate", (data) => {
                    if (selectedUser && data.sender === selectedUser.email) {
                        typingIndicatorEl.textContent = data.isTyping ? `${selectedUser.name} is typing...` : "";
                    }
                });

                await signalRConnection.start();
                console.log("SignalR Connected.");
            } catch (e) {
                console.error("SignalR connection failed:", e);
            }
        }

        // ---------- Render Messages ----------
        function renderMessage(msg) {
            const msgDiv = document.createElement("div");
            msgDiv.classList.add("message", msg.sender === currentUser.email ? "sent" : "received");
            const senderName = userMap[msg.sender] || msg.sender;

            let messageHTML = "";
            if (msg.message) messageHTML += `<span>${msg.message}</span>`;
            if (msg.fileUrl) {
                messageHTML += ` <a href="${msg.fileUrl}" target="_blank" download>📎 ${msg.fileName || "File"}</a>`;
            }

            msgDiv.innerHTML = `<strong>${senderName}:</strong> ${messageHTML}`;
            chatMessages.appendChild(msgDiv);
        }

        // ---------- Load Users ----------
        async function loadUsers() {
            try {
                const res = await fetch(`${API_BASE}/getUsers`, {
                    headers: { Authorization: `Bearer ${sessionStorage.getItem("chatToken")}` }
                });
                const users = await handleApiResponse(res);
                if (!users) return;

                userMap = {};
                userListEl.innerHTML = "";
                users.forEach(user => {
                    userMap[user.email] = user.name;
                    if (user.email !== currentUser.email) {
                        const btn = document.createElement("button");
                        btn.textContent = user.name;
                        btn.classList.add("user-button");
                        btn.onclick = () => {
                            if (typingTimeout && selectedUser) {
                                clearTimeout(typingTimeout);
                                fetch(`${API_BASE}/setTypingState`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                                    },
                                    body: JSON.stringify({ recipient: selectedUser.email, isTyping: false })
                                }).catch(err => console.error("Error sending typing state:", err));
                                typingTimeout = null;
                            }

                            selectedUser = user;
                            chatHeader.innerText = `Chat with ${user.name}`;

                            document.getElementById("chat-placeholder").style.display = "none";
                            chatMessages.style.display = "block";
                            document.querySelector(".message-input-area").style.display = "flex";
                            typingIndicatorEl.textContent = "";
                            chatMessages.innerHTML = "";

                            loadMessageHistory();
                        };
                        userListEl.appendChild(btn);
                    }
                });
            } catch (err) {
                console.error("Failed to load users:", err);
            }
        }

        // ---------- Load Message History ----------
        async function loadMessageHistory() {
            if (!selectedUser) return;
            try {
                const res = await fetch(`${API_BASE}/getMessage?receiver=${selectedUser.email}`, {
                    headers: { Authorization: `Bearer ${sessionStorage.getItem("chatToken")}` }
                });

                const messageHistory = await handleApiResponse(res);
                if (!messageHistory) return;

                messageHistory.forEach(renderMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } catch (err) {
                console.error("Failed to load message history:", err);
            }
        }

        // ---------- Send Message ----------
        async function sendMessage() {
            const text = messageInput.value.trim();
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
                    chatMessages.scrollTop = chatMessages.scrollHeight;

                    try {
                        const formData = new FormData();
                        formData.append("file", file);

                        const res = await fetch(`${API_BASE}/uploadFile`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${sessionStorage.getItem("chatToken")}` },
                            body: formData
                        });

                        const data = await handleApiResponse(res);
                        if (res.ok && data?.url) {
                            fileUrl = data.url;
                        } else {
                            throw new Error("Upload failed");
                        }
                    } catch (error) {
                        console.error("Upload error:", error);
                        const tempMsg = document.getElementById(`temp-${tempId}`);
                        if (tempMsg) {
                            tempMsg.innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> ❌ Upload failed: ${error.message}`;
                        }
                        return;
                    }

                    const tempMsg = document.getElementById(`temp-${tempId}`);
                    if (tempMsg) tempMsg.remove();
                }

                await fetch(`${API_BASE}/sendMessage`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                    },
                    body: JSON.stringify({
                        message: text,
                        receiver: selectedUser.email,
                        fileName,
                        fileUrl
                    })
                });

                messageInput.value = "";
                document.getElementById("fileInput").value = "";

                // Reset typing state
                fetch(`${API_BASE}/setTypingState`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                    },
                    body: JSON.stringify({ recipient: selectedUser.email, isTyping: false })
                }).catch(err => console.error("Error clearing typing state:", err));
                typingTimeout = null;
            } catch (error) {
                console.error("Send message failed:", error);
                showError("Failed to send your message. Please try again.");
            }
        }

        // Init
        loadUsers();
        connectToSignalR();
    }
});
