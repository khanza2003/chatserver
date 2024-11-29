import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

const app = express();

// CORS setup for frontend access
app.use(cors({
    origin: "http://localhost:5173", // Change if using a different frontend URL
    methods: ["GET", "POST"],
    credentials: true, // Allow credentials for cross-origin requests
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173", // Same as above
        methods: ["GET", "POST"],
        credentials: true,
    },
    transports: ['websocket', 'polling'],  // Explicitly specify transports
});

let users = [];

// Middleware for authentication
io.use((socket, next) => {
    const username = socket.handshake.auth.username;
    if (!username) {
        return next(new Error("Invalid username"));
    }
    // Check if the username is already taken
    const userExists = users.find(user => user.username === username);
    if (userExists) {
        return next(new Error("Username already taken"));
    }
    socket.username = username;
    socket.userId = uuidv4();
    next();
});

io.on("connection", (socket) => {
    // Add user to the list
    users.push({
        userId: socket.userId,
        username: socket.username,
    });

    // Emit list of users to the new user only
    socket.emit("users", users);

    // Emit session data to the connected user
    socket.emit("session", { userId: socket.userId, username: socket.username });

    // Broadcast to other users (exclude the current user) about the new user joining
    socket.broadcast.emit("user connected", { userId: socket.userId, username: socket.username });

    // Handle new message from users
    socket.on("new message", (message) => {
        const timestamp = new Date().toISOString();
        socket.broadcast.emit("new message", {
            userId: socket.userId,
            username: socket.username,
            message,
            timestamp,
        });
    });

    // Emit a message to the user that they have joined (this is for other users, not for the joining user)
    socket.emit("userStatus", {
        userId: socket.userId,
        username: socket.username,
        type: "userStatus",
    });

    // Handle user disconnecting
    socket.on("disconnect", () => {
        // Remove user from the list on disconnect
        users = users.filter((user) => user.userId !== socket.userId);

        // Broadcast to other users that this user has left
        socket.broadcast.emit("userStatus", {
            userId: socket.userId,
            username: socket.username,
            type: "userStatus",
        });

        // Emit updated users list to all clients
        io.emit("users", users);
    });
});

// Start server
httpServer.listen(process.env.PORT || 4001, () => {
    console.log("Server running on port 4001...");
});
