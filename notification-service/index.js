const amqp = require("amqplib");

// Global variables for connection and channel
let connection, channel;

async function connectRabbitMQWithRetry(retries = 10, delay = 5000) {
    while (retries > 0) {
        try {
            const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://admin:password@rabbitmq";
            
            console.log(`Attempting to connect to RabbitMQ... (${retries} retries left)`);
            connection = await amqp.connect(rabbitmqUrl);
            channel = await connection.createChannel();
            await channel.assertQueue("task_created", { durable: true });
            
            console.log("✅ Connected to RabbitMQ successfully");
            
            // Handle connection errors and reconnection
            connection.on('error', (err) => {
                console.error('❌ RabbitMQ connection error:', err.message);
            });
            
            connection.on('close', () => {
                console.log('🔄 RabbitMQ connection closed. Attempting to reconnect...');
                setTimeout(() => connectRabbitMQWithRetry(), 5000);
            });
            
            return true;
        } catch (error) {
            retries--;
            console.log(`❌ RabbitMQ connection failed: ${error.message}`);
            console.log(`🔄 Retries left: ${retries}`);
            
            if (retries === 0) {
                console.error("💥 Failed to connect to RabbitMQ after all retries");
                return false;
            }
            
            console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function startConsumer() {
    try {
        console.log("🎧 Notification service is listening for messages...");
        
        // Set prefetch to process one message at a time
        await channel.prefetch(1);
        
        channel.consume("task_created", (msg) => {
            if (msg !== null) {
                try {
                    // Parse the message content correctly
                    const messageContent = msg.content.toString();
                    const taskData = JSON.parse(messageContent);
                    
                    console.log("📨 New Task Notification Received:");
                    console.log("📋 Task ID:", taskData.taskId);
                    console.log("👤 User ID:", taskData.userId);
                    console.log("📝 Title:", taskData.title);
                    console.log("⏰ Timestamp:", taskData.timestamp || 'Not provided');
                    console.log("---");
                    
                    // Here you can add your notification logic:
                    // - Send email
                    // - Send push notification
                    // - Log to database
                    // - Send to external API
                    processNotification(taskData);
                    
                    // Acknowledge the message
                    channel.ack(msg);
                    
                } catch (parseError) {
                    console.error("❌ Error parsing message:", parseError.message);
                    console.error("📄 Raw message:", msg.content.toString());
                    // Reject the message (don't requeue if it's malformed)
                    channel.nack(msg, false, false);
                }
            }
        }, {
            noAck: false // Require manual acknowledgment
        });
        
    } catch (error) {
        console.error("❌ Error starting consumer:", error.message);
    }
}

async function processNotification(taskData) {
    try {
        // Add your notification processing logic here
        console.log(`🔔 Processing notification for task: ${taskData.title}`);
        
        // Example: Log to a file, send email, etc.
        // await sendEmail(taskData);
        // await sendPushNotification(taskData);
        // await logToDatabase(taskData);
        
        console.log("✅ Notification processed successfully");
        
    } catch (error) {
        console.error("❌ Error processing notification:", error.message);
    }
}

async function start() {
    console.log("🚀 Starting Notification Service...");
    
    // Add initial delay to ensure RabbitMQ is fully ready
    console.log("⏳ Waiting 10 seconds for RabbitMQ to be ready...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const connected = await connectRabbitMQWithRetry();
    
    if (connected) {
        await startConsumer();
    } else {
        console.error("💥 Could not establish RabbitMQ connection. Exiting...");
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📴 Received SIGTERM, shutting down gracefully');
    if (channel) await channel.close();
    if (connection) await connection.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📴 Received SIGINT, shutting down gracefully');
    if (channel) await channel.close();
    if (connection) await connection.close();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

start();