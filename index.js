const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { MongoClient } = require("mongodb");

const mongoURI =
  "mongoURI";
const dbName = "users";
const client = new Client();
let db;

// Function to connect to MongoDB
async function connectToMongo() {
  try {
    const mongoClient = new MongoClient(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    db = mongoClient.db(dbName);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Connect to MongoDB
connectToMongo();

client.on("qr", (qrCode) => {
  // Generate QR code for the user to scan
  qrcode.generate(qrCode, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (message) => {
  if (message.body === ".hola") {
    const user = await getUser(message.from);

    if (!user) {
      console.log("Not in queue");
      await addUser(message.from);
      message.reply("Matching....");
      matchUsers(message.from);
    } else {
      if (user.status === "connected") {
        console.log("You are already connected.");
        message.reply("You are already connected.");
      } else if (user.status === "matching") {
        console.log(
          "Already in the queue. Trying to connect to the user. Please Wait..."
        );
        message.reply(
          "Already in the queue. Trying to connect to the user. Please Wait..."
        );
      } else {
        changeStatus(message.from, "matching");
        message.reply("Matching....");
        matchUsers(message.from);
      }
    }
  } else if (message.body === ".adios") {
    const user = await getUser(message.from);

    if (!user) {
      console.log("User not connected");
      message.reply("Please connect with someone first.");
    } else {
      if (user.status === "connected") {
        const connectedUser = await getUser(user.connectedUser);
        console.log("Users disconnected", user, connectedUser);
        client.sendMessage(user.id, "You have been disconnected");
        client.sendMessage(connectedUser.id, "Another user disconnected");

        await disconnectUser(user.id);
        await disconnectUser(connectedUser.id);
      } else if (user.status === "matching") {
        client.sendMessage(user.id, "You have been disconnected");
        await disconnectUser(user.id);
      } else {
        console.log("User not connected");
        message.reply("Please connect with someone first.");
      }
    }
  } else if (message.body === ".status") {
    const user = await getUser(message.from);
    if (user) {
      if (user.status === "connected") {
        client.sendMessage(
          message.from,
          `You are connected to ${user.connectedUser}`
        );
      } else if (user.status === "matching") {
        client.sendMessage(message.from, "Trying to connect to the user");
      } else {
        client.sendMessage(message.from, "You are not connected to anyone.");
      }
    } else {
      client.sendMessage(
        message.from,
        "You are not connected to anyone. Please type *.hola* to connect"
      );
    }
  } else {
    const user = await getUser(message.from);

    if (user && user.status === "connected") {
      const newMessage = message.body;
      await addMessage(user.id, newMessage);
      client.sendMessage(user.connectedUser, newMessage);
    }
  }
});

async function addUser(userId) {
  const user = {
    id: userId,
    timestamp: Date.now(),
    status: "matching",
    messages: [],
    connectedUser: null,
  };

  try {
    const result = await db.collection("users").insertOne(user);
    console.log("User added to MongoDB:", result.ops[0]);
    return result.ops[0];
  } catch (error) {
    console.error("Error adding user to MongoDB:", error);
    return null;
  }
}

async function getUser(userId) {
  try {
    const user = await db.collection("users").findOne({ id: userId });
    console.log("User retrieved from MongoDB:", user);
    return user;
  } catch (error) {
    console.error("Error retrieving user from MongoDB:", error);
    return null;
  }
}

async function disconnectUser(userId) {
  try {
    const result = await db.collection("users").updateOne(
      { id: userId },
      {
        $set: {
          status: "disconnected",
          connectedUser: null,
        },
      }
    );
    console.log("User disconnected in MongoDB:", result);
  } catch (error) {
    console.error("Error disconnecting user in MongoDB:", error);
  }
}

async function addMessage(userId, newMessage) {
  try {
    const result = await db.collection("users").updateOne(
      { id: userId },
      {
        $push: {
          messages: newMessage,
        },
      }
    );
    console.log("Message added to MongoDB:", result);
  } catch (error) {
    console.error("Error adding message to MongoDB:", error);
  }
}

function getRandomUsers(notConnectedUsers) {
  console.log("Random users called");
  const matchedUsers = [];

  if (notConnectedUsers.length >= 2) {
    while (matchedUsers.length < 2) {
      const randomIndex = Math.floor(Math.random() * notConnectedUsers.length);
      if (!matchedUsers.includes(notConnectedUsers[randomIndex])) {
        matchedUsers.push(notConnectedUsers[randomIndex]);
      }
    }
  }

  return matchedUsers;
}

async function matchUsers(userId) {
  const notConnectedUsers = await getNotConnectedUsers();

  if (notConnectedUsers.length >= 2) {
    const connectedUsers = getRandomUsers(notConnectedUsers);
    const user1 = connectedUsers[0];
    const user2 = connectedUsers[1];

    await connectUsers(user1.id, user2.id);

    console.log("Matched users:", user1.id, "and", user2.id);
    client.sendMessage(
      user1.id,
      `You have been matched with ${user2.id}. Start chatting!`
    );
    client.sendMessage(
      user2.id,
      `You have been matched with ${user1.id}. Start chatting!`
    );
  } else {
    console.log("No users to match");
    client.sendMessage(userId, "No users to match, Please Wait...");
  }
}

async function getNotConnectedUsers() {
  try {
    const notConnectedUsers = await db
      .collection("users")
      .find({ status: "matching" })
      .toArray();
    console.log("Not connected users:", notConnectedUsers);
    return notConnectedUsers;
  } catch (error) {
    console.error("Error retrieving not connected users from MongoDB:", error);
    return [];
  }
}

async function connectUsers(userId1, userId2) {
  try {
    await db.collection("users").updateOne(
      { id: userId1 },
      {
        $set: {
          status: "connected",
          connectedUser: userId2,
        },
      }
    );
    await db.collection("users").updateOne(
      { id: userId2 },
      {
        $set: {
          status: "connected",
          connectedUser: userId1,
        },
      }
    );
    console.log("Users connected in MongoDB:", userId1, "and", userId2);
  } catch (error) {
    console.error("Error connecting users in MongoDB:", error);
  }
}

const changeStatus = async (userId, stat) => {
  console.log(userId, "wdwdfidjw", stat);
  try {
    await db.collection("users").updateOne(
      { id: userId },
      {
        $set: {
          status: stat,
        },
      }
    );
  } catch (error) {
    console.error("Error changing status in MongoDB:", error);
  }
};

client.initialize();
