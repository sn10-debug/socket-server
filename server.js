// server.js

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

// Create Express app
const app = express();
app.use(cors());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO server
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins (modify as needed)
    methods: ["GET", "POST"],
  },
});

// Data structure to hold connected drivers
const drivers = new Map();

const pubClient = createClient({ host: "localhost", port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

io.on("connection", async (socket) => {
  console.log("A driver connected:", socket.id);

  socket.on("driver-info", (data) => {
    // Data should include driverId, location, vehicleType, status
    drivers.set(socket.id, { ...data, socketId: socket.id });
    console.log("Driver info updated:", drivers.get(socket.id));
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Driver disconnected:", socket.id);
    drivers.delete(socket.id);
  });
});

// Endpoint to emit events
app.post("/emit", express.json(), (req, res) => {
  const { event, data } = req.body;

  if (event === "new-booking") {
    console.log("New Booking Event Received");
    // Emit to relevant drivers
    emitToRelevantDrivers(data);
  }

  res.status(200).json({ message: "Event emitted" });
});

// Function to emit event to relevant drivers
function emitToRelevantDrivers(booking) {
  const { pickupLocation, vehicleType } = booking;
  console.log(drivers);
  drivers.forEach((driver) => {
    if (
      driver.status === "available" &&
      driver.vehicleType === vehicleType &&
      isWithinRadius(
        pickupLocation.coordinates,
        driver.location.coordinates,
        1000 // Radius in km
      )
    ) {
      io.to(driver.socketId).emit("new-booking", booking);
      console.log(`Emitted booking to driver ${driver.socketId}`);
    }
  });
}

// Helper function to calculate distance between two coordinates
function isWithinRadius(coord1, coord2, radius) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radius;
}

// Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
