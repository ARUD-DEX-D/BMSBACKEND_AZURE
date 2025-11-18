const admin = require("firebase-admin");

// Load your Firebase admin SDK key
const serviceAccount = require("./firebase-admin-key.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Replace this with your device's FCM token
const deviceToken = "fcTz107SSZ6QKR8eiArHrS:APA91bGR6gP8GaDF6ANYcdQWapn3blUdPW3kvBasAe6HCsmTCQwoPoWytr1YhAjH8_SJ5isEHARow7FUUhIQ_sc4Fo6E7iS4l3Lks74RxswaqY6OPCE_S5I";

// Notification payload
const message = {
  token: deviceToken,
  notification: {
    title: "🚨 SLA Breach Alert",
    body: "Room 101 SLA time exceeded!",
  },
  android: {
    priority: "high",
    notification: {
      sound: "default", // or use custom: sound: "alert"
    }
  }
};

// Send notification
admin.messaging().send(message)
  .then((response) => {
    console.log("✅ Successfully sent message:", response);
  })
  .catch((error) => {
    console.error("❌ Error sending message:", error);
  });
