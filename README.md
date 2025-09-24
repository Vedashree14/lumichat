# LumiChat

LumiChat is a real-time chat application built with **Azure Static Web Apps** for the frontend and **Azure Functions** for the backend.  
It supports secure authentication, real-time messaging via SignalR, file sharing with Azure Blob Storage, and typing indicators.

---

## Features

- **User Authentication**  
  - Sign up with name, email, and password  
  - Secure login with JWT-based sessions  

- **Real-Time Messaging**  
  - One-to-one chat powered by Azure SignalR Service  
  - Automatic updates for new messages  

- **File Sharing**  
  - Upload files using secure SAS URLs  
  - Files stored in Azure Blob Storage  
  - Downloadable links inside the chat  

- **Typing Indicators**  
  - Live typing status when the other user is typing  

- **Session Management**  
  - Token-based authentication  
  - Automatic logout on session expiration  

---

## Tech Stack

- **Frontend**:  
  - HTML, CSS, JavaScript  
  - Hosted on Azure Static Web Apps  

- **Backend**:  
  - Azure Functions (JavaScript/Node.js)  
  - Authentication and JWT handling with `bcryptjs` and `jsonwebtoken`  
  - Cosmos DB for user and message storage  
  - Azure Blob Storage for file uploads  
  - Azure SignalR Service for real-time updates  

- **Dependencies**:  
  - `@azure/storage-blob`  
  - `@azure/cosmos`  
  - `bcryptjs`  
  - `jsonwebtoken`  

---

## Project Structure

```
.
├── frontend/          # Static frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── login.html
│   ├── chat.html
│   ├── script.js
│   └── styles.css
│
├── api/               # Azure Functions backend
│   ├── signup/        # User registration
│   ├── login/         # User login & JWT generation
│   ├── getUsers/      # Fetch user list
│   ├── sendMessage/   # Store & send chat messages
│   ├── getMessage/    # Retrieve chat history
│   ├── setTypingState/# Handle typing indicator state
│   ├── getUploadSas/  # Generate SAS token for file uploads
│   ├── negotiate/     # SignalR negotiation
│   └── package.json   # Backend dependencies
│
└── .github/workflows/ # GitHub Actions CI/CD
    └── azure-static-web-apps.yml
```

---

## Deployment

This project is deployed using **Azure Static Web Apps CI/CD** via GitHub Actions.

- **Frontend** is deployed to Azure Static Web Apps (`app_location: "frontend"`)  
- **Backend** Azure Functions are deployed automatically (`api_location: "api"`)  
- Configuration is managed through `.github/workflows/azure-static-web-apps.yml`

---

## Usage

1. **Sign up** with a new account  
2. **Log in** to access the chat  
3. **Select a user** from the list to start a conversation  
4. **Send messages** or upload files  
5. **See typing indicators** when the other user is typing  

---

## Security

- Passwords are hashed using `bcryptjs`  
- JWT is used for session authentication  
- File uploads use time-limited **SAS URLs** to ensure secure access  
