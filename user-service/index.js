
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");


const app = express();
const port = 3001;

app.use(bodyParser.json());

// connecting mongodb using mongodb image
// mongoose.connect('mongodb://localhost:27017/users').then(()=>{
//     console.log("MongoDB connected successfully...");
// }).catch(error => console.error("MongoDB connection error",error));

// chnaged the localhost to mongo(which is the service we created using dockor)
mongoose.connect('mongodb://mongo:27017/users').then(()=>{
    console.log("MongoDB Image connected successfully...");
}).catch(error => console.error("MongoDB connection error",error));

// creating a schema for user
const UserSchema = mongoose.Schema({
    name: String,
    email: String
});

// creating a user model for the database
const User = mongoose.model("User",UserSchema);

// creating the end point for adding new user

app.post("/users", async (req, res) => {
    const { name , email } = req.body;

    try {
        const user = new User({ name , email});
        await user.save()
        res.status(201).json({
            user,
            message:"User Created Successfull..."
        })
        
    } catch (error) {
        console.error("Error Occured using signup",error);
        res.status(500).json({ error:"Internal Server Error"})
    }
})

// creating an endpoint for getting all users
app.get("/users",async (req, res) => {
    const users = await User.find()
    res.status(200).json({
        users,
        Message:"Users successfully fetched"
    })
})


app.get("/",(req, res)=>{
    res.send("heloo")
});


app.listen(port,()=>{
    console.log(`User Service running at port:${port}`);
    
})