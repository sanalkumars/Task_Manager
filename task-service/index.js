const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const amqp = require("amqplib");

const app = express();
const port = 3002;
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect('mongodb://mongo:27017/tasks').then(() => {
    console.log("MongoDB connected successfully...");
}).catch(error => console.error("MongoDB connection error", error));

// Task Schema
const TaskSchema = mongoose.Schema({
    title: String,
    description: String,
    userId: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
});

const Task = mongoose.model("Task", TaskSchema);

// RabbitMQ connection variables
let channel, connection;

async function connectRabbitMQWithRetry(retries = 10, delay = 5000) {
    while (retries > 0) {
        try {
            // Use credentials if set in docker-compose
            const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://admin:password@rabbitmq";
            
            connection = await amqp.connect(rabbitmqUrl);
            channel = await connection.createChannel();
            await channel.assertQueue("task_created", { durable: true });
            
            console.log("Connected to RabbitMQ successfully");
            
            // Handle connection errors
            connection.on('error', (err) => {
                console.error('RabbitMQ connection error:', err);
            });
            
            connection.on('close', () => {
                console.log('RabbitMQ connection closed. Attempting to reconnect...');
                setTimeout(() => connectRabbitMQWithRetry(), delay);
            });
            
            return;
        } catch (error) {
            retries--;
            console.log(`RabbitMQ connection failed: ${error.message}`);
            console.log(`Retries left: ${retries}`);
            
            if (retries === 0) {
                console.error("Failed to connect to RabbitMQ after all retries");
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// API endpoints
app.post("/tasks", async (req, res) => {
    const { title, description, userId } = req.body;
    
    if (!title || !description || !userId) {
        return res.status(400).json({ error: "All fields (title, description, userId) are required!" });
    }
    
    try {
        const task = new Task({ title, description, userId });
        await task.save();
        
        // Send message to RabbitMQ queue
        const message = { 
            taskId: task._id.toString(), 
            userId, 
            title,
            timestamp: new Date().toISOString()
        };
        
        if (!channel) {
            console.warn("RabbitMQ channel not available. Task created but notification not sent.");
            return res.status(201).json({
                task,
                message: "Task created successfully (notification service unavailable)",
                warning: "Notification not sent"
            });
        }
        
        try {
            channel.sendToQueue("task_created", Buffer.from(JSON.stringify(message)), {
                persistent: true
            });
            console.log("Task notification sent to queue");
        } catch (queueError) {
            console.error("Failed to send message to queue:", queueError);
        }
        
        res.status(201).json({
            task,
            message: "Task created successfully"
        });
        
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/tasks", async (req, res) => {
    try {
        const { userId } = req.query;
        const filter = userId ? { userId } : {};
        
        const tasks = await Task.find(filter).sort({ createdAt: -1 });
        
        res.status(200).json({
            tasks,
            message: "Tasks fetched successfully",
            count: tasks.length
        });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    const status = {
        service: "task-service",
        status: "running",
        mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        rabbitmq: channel ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    };
    
    res.status(200).json(status);
});

app.get("/", (req, res) => {
    res.json({ message: "Task Service API", version: "1.0.0" });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    if (connection) {
        await connection.close();
    }
    await mongoose.connection.close();
    process.exit(0);
});

// Start server
app.listen(port, () => {
    console.log(`Task Service running on port: ${port}`);
    // Start RabbitMQ connection with delay to allow RabbitMQ to fully start
    setTimeout(() => {
        connectRabbitMQWithRetry();
    }, 10000); // 10 second delay
});