const sql = require('mssql/msnodesqlv8');
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key.json");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}


function getISTDate() {
  const now = new Date();
  // IST offset in milliseconds (+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset);
}


const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

function logToFile(message, department) {
  const date = getCurrentDate();
  const cleanDept = department.replace(/[^\w\s]/gi, '_');
  const logFileName = `sla_logs_${date}__${cleanDept}.txt`;
  const logFilePath = path.join(__dirname, 'logs', logFileName);
  const timestamp = new Date().toLocaleString();
  const fullEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, fullEntry, 'utf8');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const dbConfig = {
  server: 'DESKTOP-QSJC5FP',
  database: 'BED_TRACKING_SYSTEM',
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
  },
};

async function sendBreachNotifications() {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT 
        D.DEPTName,
        D.HOD_FCM_Token,
        F.FACILITY_CKD_ROOMNO AS RoomNo,
        F.USERID,
        F.FACILITY_CHECK_ID AS FacilityCheckID,
        F.SLA_NOTIFICATION_STATUS,
        CASE
          WHEN 
            DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.ASSIGNED_TIME, GETDATE())) > D.AssignSLA_Min
            AND DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.COMPLETED_TIME, GETDATE())) > D.CompletionSLA_Min
            THEN 3
          WHEN 
            DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.COMPLETED_TIME, GETDATE())) > D.CompletionSLA_Min
            THEN 2
          WHEN 
            DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.ASSIGNED_TIME, GETDATE())) > D.AssignSLA_Min
            THEN 1
          ELSE 0
        END AS BreachType
      FROM FACILITY_CHECK_DETAILS F
      JOIN Facility_Dept_Master D ON F.FACILITY_CKD_DEPT = D.DEPTName
      WHERE F.STATUS IN (0, 1, 2, 3, 4)
      AND (
        DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.ASSIGNED_TIME, GETDATE())) > D.AssignSLA_Min
        OR DATEDIFF(MINUTE, F.DISC_RECOM_TIME, ISNULL(F.COMPLETED_TIME, GETDATE())) > D.CompletionSLA_Min
      )
    `);

    const breaches = result.recordset;

    const grouped = breaches.reduce((acc, row) => {
      const key = row.DEPTName;
      if (!acc[key]) acc[key] = { token: row.HOD_FCM_Token, details: [] };
      acc[key].details.push(row);
      return acc;
    }, {});

    for (const [deptName, { token, details }] of Object.entries(grouped)) {
      let messageLines = [];

      for (const entry of details) {
        const { BreachType, SLA_NOTIFICATION_STATUS } = entry;

        if (BreachType === 0 || BreachType === SLA_NOTIFICATION_STATUS) {
          continue; // ✅ Skip if no breach or already notified
        }

        const type =
          BreachType === 1 ? "🟠Assign SLA Breached" :
          BreachType === 2 ? "🔴Completion SLA Breached" :
          BreachType === 3 ? "🟠🔴Both SLA Breached" : "";

        const ticketId = `Ticket:${String(entry.FacilityCheckID).padEnd(2)}`;
        const room = `Room:${entry.RoomNo.trim().padEnd(2)}`;
        messageLines.push(`${ticketId} ${room} ${type}`);

     

        // ✅ Update SLA_NOTIFICATION_STATUS in FACILITY_CHECK_DETAILS
        await pool.request()
          .input('NewStatus', sql.Int, BreachType)
          .input('FacilityCheckID', sql.Int, entry.FacilityCheckID)
          .query(`
            UPDATE FACILITY_CHECK_DETAILS
            SET SLA_NOTIFICATION_STATUS = @NewStatus
            WHERE FACILITY_CHECK_ID = @FacilityCheckID
          `);
      }

      const body = messageLines.join('\n');

      if (token && body.length > 0) {
        await admin.messaging().send({
          token,
          notification: {
            title: `🚨 Facility Check SLA Breach - ${deptName}`,
            body: body.length > 300 ? body.slice(0, 300) + '...' : body,
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


        // ✅ Insert only the ones that were sent
for (const entry of details) {
  const { BreachType, SLA_NOTIFICATION_STATUS } = entry;

  if (BreachType === 0 || BreachType === SLA_NOTIFICATION_STATUS) {
    continue; // Already skipped earlier
  }

  await pool.request()
    .input('TicketID', sql.Int, entry.FacilityCheckID)
    .input('TicketType', sql.NVarChar(50), 'Facility')
    .input('DeptName', sql.NVarChar(100), entry.DEPTName)
    .input('USERID', sql.NVarChar(50), entry.USERID)
    .input('RoomNo', sql.NVarChar(50), entry.RoomNo.trim())
    .input('BreachType', sql.Int, entry.BreachType)
    .input('BreachDateTime', sql.DateTime, getISTDate())
    .input('Raised_DeptName', sql.NVarChar(100), entry.DEPTName)
    .query(`
      INSERT INTO SLA_Notifications (
        TicketID, TicketType, DeptName, USERID, RoomNo,
        BreachType, BreachDateTime, Raised_DeptName
      )
      VALUES (
        @TicketID, @TicketType, @DeptName, @USERID, @RoomNo,
        @BreachType, @BreachDateTime, 'Facility_Check'
      )
    `);
}

        console.log(`✅ Notification sent to ${deptName}`);
        logToFile(`✅ Notification sent to ${deptName}\n${body}`, deptName);
      }
    }

    sql.close();
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

  sendBreachNotifications();

// 🕗 Run every 5 minutes (you can customize this)
cron.schedule('*/1 * * * *', () => {
  console.log(`[${new Date().toLocaleString()}] 🔁 Running SLA breach check...`);
  sendBreachNotifications();
});



