require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./src/app");

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Check if Mongo URI exists
if (!MONGO_URI) {
    console.error("MONGO_URI is missing in environment variables");
    process.exit(1);
}

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI)
.then(() => {
    console.log("MongoDB Connected");

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

})
.catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
});