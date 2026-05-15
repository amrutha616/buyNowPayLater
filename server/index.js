require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./src/app");

const PORT = Number(process.env.PORT) || 5000;

mongoose.connect("mongodb://127.0.0.1:27017/bnplDB")
.then(() => {
    console.log("MongoDB Connected");

    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${PORT} is already in use. Stop the running process or set a different PORT in .env.`);
            process.exit(1);
        }

        console.error("Server startup error:", err.message);
        process.exit(1);
    });

})
.catch(err => console.log(err));