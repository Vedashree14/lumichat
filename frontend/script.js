//const API_BASE = "http://localhost:7071/api";
const API_BASE = "/api";

let currentUser = JSON.parse(localStorage.getItem("chatUser")) || null;
let selectedUser = null;
let userMap = {};
let messageInterval = null;

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
                    alert(data.message || "Signup failed.");
                }
            } catch (err) {
                console.error("Signup error:", err);
                alert("Something went wrong. See console for details.");
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
                localStorage.setItem("chatUser", JSON.stringify(data.user));
                window.location.href = "chat.html";
            } else {
                alert(data.message || "Login failed.");
            }
        });
    }

    if (window.location.pathname.endsWith("chat.html")) {
        if (!currentUser) return window.location.href = "login.html";

        const userListEl = document.getElementById("userList");
        const chatHeader = document.getElementById("chatHeader");
        const chatMessages = document.getElementById("chatMessages");
        const messageInput = document.getElementById("messageInput");

        if (messageInput) {
            messageInput.style.width = "70%";
            messageInput.style.padding = "10px";
            messageInput.style.fontSize = "16px";
            messageInput.style.color = "#000";
            messageInput.style.borderRadius = "8px";
        }

        async function loadUsers() {
            const res = await fetch(`${API_BASE}/getUsers`);
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
                        selectedUser = user;
                        chatHeader.innerText = `Chat with ${user.name}`;

                        // Clear chat and stop old interval
                        chatMessages.innerHTML = "";
                        if (messageInterval) clearInterval(messageInterval);

                        loadMessages(); // Load fresh chat
                        messageInterval = setInterval(loadMessages, 3000); // Start fresh interval
                    };
                    userListEl.appendChild(btn);
                }
            });
        }

        async function loadMessages() {
            if (!selectedUser) return;
            try {
                const res = await fetch(`${API_BASE}/getMessage?sender=${currentUser.email}&receiver=${selectedUser.email}`);
                const messages = await res.json();

                chatMessages.innerHTML = "";
                messages.forEach(msg => {
                    const msgDiv = document.createElement("div");
                    msgDiv.classList.add("message", msg.sender === currentUser.email ? "sent" : "received");

                    const senderName = userMap[msg.sender] || msg.sender;

                    if (msg.message.startsWith("http")) {
                        msgDiv.innerHTML = `<strong>${senderName}:</strong> <a href="${msg.message}" target="_blank" download>📎 ${msg.fileName || "File"}</a>`;
                    } else if (msg.message.includes("[File:")) {
                        const parts = msg.message.split("[File:");
                        const text = parts[0].trim();
                        const fileUrl = parts[1].replace("]", "").trim();
                        msgDiv.innerHTML = `<strong>${senderName}:</strong> ${text} <a href="${fileUrl}" target="_blank" download>📎 ${msg.fileName || "File"}</a>`;
                    } else {
                        msgDiv.innerHTML = `<strong>${senderName}:</strong> ${msg.message}`;
                    }

                    chatMessages.appendChild(msgDiv);
                });

                // Scroll to latest message
                chatMessages.scrollTop = chatMessages.scrollHeight;

            } catch (err) {
                console.error("Failed to load messages:", err);
            }
        }

        window.sendMessage = async function () {
            const text = document.getElementById("messageInput").value;
            const file = document.getElementById("fileInput").files[0];

            if (!selectedUser || (!text && !file)) return;

            let messageContent = text;
            let status = "sent";
            let fileName = file ? file.name : null;
            const tempId = Date.now();

            if (file) {
                const uploadingMsg = document.createElement("div");
                uploadingMsg.classList.add("message", "sent");
                uploadingMsg.id = `temp-${tempId}`;
                uploadingMsg.innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> Uploading "${file.name}"...`;
                chatMessages.appendChild(uploadingMsg);

                try {
                    const formData = new FormData();
                    formData.append("file", file);

                    const res = await fetch(`${API_BASE}/uploadFile`, {
                        method: "POST",
                        body: formData
                    });

                    if (!res.ok) throw new Error("Upload failed");
                    const data = await res.json();

                    if (data && data.url) {
                        messageContent = text ? `${text} [File: ${data.url}]` : data.url;
                    } else {
                        throw new Error("Upload response invalid");
                    }
                } catch (error) {
                    console.error("Upload error:", error);
                    document.getElementById(`temp-${tempId}`).innerHTML = `<strong>${currentUser.name || currentUser.email}:</strong> ❌ Upload failed`;
                    return;
                }

                document.getElementById(`temp-${tempId}`).remove();
            }

            await fetch(`${API_BASE}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sender: currentUser.email,
                    receiver: selectedUser.email,
                    message: messageContent,
                    status,
                    fileName
                })
            });

            document.getElementById("messageInput").value = "";
            document.getElementById("fileInput").value = "";
            loadMessages();
        };

        loadUsers();
    }
});
