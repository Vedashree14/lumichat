// script.js
const API_BASE = "https://lumichatfunctions-ambmbygeeydaf4gd.westus3-01.azurewebsites.net/api";

let currentUser = null;
let selectedUser = null;
let userMap = {};
let signalRConnection = null;
let typingTimeout = null;

function logout() {
    console.debug("[logout] clearing sessionStorage");
    sessionStorage.removeItem("chatUser");
    sessionStorage.removeItem("chatToken");
    window.location.href = "login.html";
}

function showError(message) {
    alert(message);
}

// ----------------- API Helper -----------------
async function handleApiResponse(res) {
    if (!res) return null;
    if (res.status === 401) {
        console.warn("[handleApiResponse] 401 -> logout");
        alert("Session expired. Please log in again.");
        logout();
        return null;
    }
    try {
        return await res.json();
    } catch (err) {
        console.error("[handleApiResponse] failed to parse json", err);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // DEBUG: inspect sessionStorage at load
    console.debug("[DOMContentLoaded] sessionStorage keys:", Object.keys(sessionStorage));
    console.debug("[DOMContentLoaded] raw chatUser:", sessionStorage.getItem("chatUser"));
    currentUser = JSON.parse(sessionStorage.getItem("chatUser"));
    const token = sessionStorage.getItem("chatToken");
    console.debug("[DOMContentLoaded] currentUser, token present:", !!currentUser, !!token);

    if (window.location.pathname.endsWith("chat.html") && (!currentUser || !token)) {
        console.warn("[DOMContentLoaded] not authenticated -> redirect to login");
        return (window.location.href = "login.html");
    }

    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    // ----------------- SIGNUP -----------------
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("name").value.trim();
            const email = document.getElementById("email").value.trim().toLowerCase();
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
            const email = document.getElementById("loginEmail").value.trim().toLowerCase();
            const password = document.getElementById("loginPassword").value;

            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const data = await handleApiResponse(res);

                // DEBUG
                console.debug("[login] response ok:", res.ok, "data:", data);

                if (res.ok && data && data.token) {
                    sessionStorage.setItem("chatUser", JSON.stringify(data.user));
                    sessionStorage.setItem("chatToken", data.token);
                    console.debug("[login] saved chatUser & chatToken to sessionStorage");
                    window.location.href = "chat.html";
                } else {
                    // If server returned 200 but missing token, show details
                    const msg = data?.message || "Login failed: missing token or user";
                    console.warn("[login] failed:", msg);
                    showError(msg);
                }
            } catch (err) {
                console.error("Login error:", err);
                showError("Something went wrong. See console for details.");
            }
        });
    }

    // ----------------- CHAT -----------------
    if (window.location.pathname.endsWith("chat.html")) {
        const logoutButton = document.getElementById("logoutButton");
        if (logoutButton) logoutButton.onclick = logout;

        const userListEl = document.getElementById("userList");
        const chatHeader = document.getElementById("chatHeader");
        const chatMessages = document.getElementById("chatMessages");
        const messageInput = document.getElementById("messageInput");
        const typingIndicatorEl = document.getElementById("typingIndicator");
        const sendButton = document.getElementById("sendButton");

        if (sendButton) sendButton.addEventListener("click", sendMessage);

        // Typing state (unchanged)
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

        // SignalR connect
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
                console.debug("[connectToSignalR] connectionInfo:", connectionInfo);

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
                        typingIndicatorEl.style.display = data.isTyping ? 'block' : 'none';
                    }
                });

                await signalRConnection.start();
                console.log("SignalR Connected.");
            } catch (e) {
                console.error("SignalR connection failed:", e);
            }
        }

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

        // Users and message loading
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
                        btn.onclick = () => selectUser(user);
                        userListEl.appendChild(btn);
                    }
                });
            } catch (err) {
                console.error("Failed to load users:", err);
            }
        }

        function selectUser(user) {
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
        }

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

        // Send message (SAS flow is used here)
        async function sendMessage() {
            const text = messageInput.value.trim();
            const file = document.getElementById("fileInput").files[0];
            if (!selectedUser || (!text && !file)) return;

            const tempId = Date.now();
            let fileUrl = null;
            let fileName = file ? file.name : null;

            if (file) {
                const uploadingMsg = document.createElement("div");
                uploadingMsg.classList.add("message", "sent");
                uploadingMsg.id = `temp-${tempId}`;
                uploadingMsg.innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> Uploading "${file.name}"...`;
                chatMessages.appendChild(uploadingMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                try {
                    const sasRes = await fetch(`${API_BASE}/getUploadSas`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${sessionStorage.getItem("chatToken")}`
                        },
                        body: JSON.stringify({ fileName: file.name })
                    });

                    const sasData = await handleApiResponse(sasRes);
                    console.debug("[sendMessage] sasData:", sasData);
                    if (!sasRes.ok || !sasData?.uploadUrl) {
                        throw new Error(sasData?.message || "Failed to get upload URL");
                    }

                    const { uploadUrl, downloadUrl } = sasData;

                    const putRes = await fetch(uploadUrl, {
                        method: "PUT",
                        headers: {
                            "x-ms-blob-type": "BlockBlob",
                            "Content-Type": file.type || "application/octet-stream"
                        },
                        body: file
                    });

                    if (!putRes.ok) {
                        const t = await putRes.text().catch(()=>null);
                        throw new Error(`Upload failed (${putRes.status}): ${t || putRes.statusText}`);
                    }

                    fileUrl = downloadUrl;
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

            try {
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
            } catch (err) {
                console.error("Send message failed:", err);
                showError("Failed to send your message. Please try again.");
            }
        }

        // Init
        loadUsers();
        connectToSignalR();
    }
});
