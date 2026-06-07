const { io } = require("socket.io-client");

const socket = io("http://localhost:3000/user", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("Connected with socket id:", socket.id);
  socket.emit("register", { device_uuid: "d0:11:e5:13:77:c7" });
  
  setTimeout(() => {
    console.log("Disconnecting socket...");
    socket.disconnect();
  }, 1000);
});

socket.on("disconnect", () => {
  console.log("Socket disconnected.");
  process.exit(0);
});
