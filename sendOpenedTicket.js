const sql = require('mssql/msnodesqlv8');
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key.json");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// 🧠 IST Timestamp
function getISTDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset);
}

// 📁 Setup logs
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

function logToFile(message, department) {
  const date = new Date().toISOString().split('T')[0];
  const cleanDept = department.replace(/[^\w\s]/gi, '_');
  const logFileName = `new_ticket_log_${date}__${cleanDept}.txt`;
  const logFilePath = path.join(logsDir, logFileName);
  const timestamp = new Date().toLocaleString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`, 'utf8');
}

// 🔐 Firebase Setup
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 📡 Database Config
const dbConfig = {
  server: 'DESKTOP-QSJC5FP',
  database: 'BED_TRACKING_SYSTEM',
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
  },
};

// 🚨 New Ticket Notification Sender
async function sendNewTicketNotifications() {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT 
        F.FACILITY_CHECK_ID,
        F.FACILITY_CKD_DEPT,
        F.FACILITY_CKD_ROOMNO,
        F.DISC_RECOM_TIME,
        F.TKT_STATUS,
        D.HOD_FCM_Token
      FROM FACILITY_CHECK_DETAILS F
      JOIN Facility_Dept_Master D ON F.FACILITY_CKD_DEPT = D.DEPTName
      WHERE F.TKT_STATUS = 0 AND F.IS_TICKET_NOTIFIED = 0
    `);

    const tickets = result.recordset;

    for (const ticket of tickets) {
      const {
        FACILITY_CHECK_ID,
        FACILITY_CKD_DEPT,
        FACILITY_CKD_ROOMNO,
        DISC_RECOM_TIME,
        HOD_FCM_Token
      } = ticket;

      const message = `🆔 Ticket ID: ${FACILITY_CHECK_ID}\n📍 Room: ${FACILITY_CKD_ROOMNO.trim()}\n📅 Time: ${new Date(DISC_RECOM_TIME).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

      if (HOD_FCM_Token) {
        await admin.messaging().send({
          token: HOD_FCM_Token,
          notification: {
            title: `🆕 New Facility Ticket - ${FACILITY_CKD_DEPT}`,
            body: message,
          },
          android: {
            notification: {
              sound: 'notification',
              channelId: 'high_importance_channel',
              priority: 'high',
              visibility: 'public',
            },
          },
        });

        // ✅ Mark ticket as notified
        await pool.request()
          .input('id', sql.Int, FACILITY_CHECK_ID)
          .query(`
            UPDATE FACILITY_CHECK_DETAILS
            SET IS_TICKET_NOTIFIED = 1
            WHERE FACILITY_CHECK_ID = @id
          `);

        console.log(`✅ New ticket notified: Ticket ${FACILITY_CHECK_ID} (${FACILITY_CKD_DEPT})`);
        logToFile(`New ticket notified: Ticket ${FACILITY_CHECK_ID}, Room ${FACILITY_CKD_ROOMNO}`, FACILITY_CKD_DEPT);
      }
    }

    sql.close();
  } catch (err) {
    console.error("❌ Error in sending new ticket notification:", err);
  }
}

// 🚀 Initial Run
sendNewTicketNotifications();

// ⏰ Cron - every minute
cron.schedule('*/1 * * * *', () => {
  console.log(`[${new Date().toLocaleString()}] 🔁 Checking for new tickets...`);
  sendNewTicketNotifications();
});
