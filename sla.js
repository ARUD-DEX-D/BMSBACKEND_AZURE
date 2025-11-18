const admin = require('firebase-admin');
const sql = require('mssql/msnodesqlv8');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./firebase-admin-key.json');

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

const logToFile = (message, dept) => {
  const logFile = path.join(__dirname, 'logs', `${dept}_notifications.log`);
  const logEntry = `[${new Date().toLocaleString()}] ${message}\n`;

  try {
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (err) {
    console.error(`❌ Failed to write log for ${dept}:`, err.message);
  }
};

// Global crash catchers
process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

async function sendSlaAlerts() {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT  F.AssignSLA_Min, F.CompletionSLA_Min,
             D.DISC_RECOM_TIME, D.ASSIGNED_TIME, D.COMPLETED_TIME, D.STATUS
      FROM Facility_Dept_Master F
      INNER JOIN FACILITY_CHECK_DETAILS D ON F.DEPTName = D.FACILITY_CKD_DEPT
      
    `);

    const entries = result.recordset;

    for (const entry of entries) {
      
      const assignSLA = entry.AssignSLA_Min || 0;
      const completeSLA = entry.CompletionSLA_Min || 0;
      const disc = entry.DISC_RECOM_TIME;
      const assigned = entry.ASSIGNED_TIME;
      const completed = entry.COMPLETED_TIME;
      

      const now = new Date();
      const assignDeadline = new Date(disc.getTime() + assignSLA * 60000);
      const completeDeadline = assigned
        ? new Date(assigned.getTime() + completeSLA * 60000)
        : null;

      let breachType = null;

      if (!assigned && now > assignDeadline) {
        breachType = 'Assignment SLA';
      } else if (assigned && !completed && now > completeDeadline) {
        breachType = 'Completion SLA';
      }

      if (breachType) {
        const body = `Room ${room} in ${deptName} has breached ${breachType}.\nDischarge: ${disc.toLocaleString()}\nAssigned: ${assigned ? assigned.toLocaleString() : 'Not Assigned'}\nCompleted: ${completed ? completed.toLocaleString() : 'Not Completed'}`;

        const token = 'YOUR_DEVICE_FCM_TOKEN'; // Replace with actual FCM token

        try {
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

          logToFile(`✅ FCM sent to ${deptName} - ${breachType}`, deptName);
          console.log(`✅ FCM sent to ${deptName} - ${breachType}`);
        } catch (fcmErr) {
          console.error(`❌ FCM failed for ${deptName}:`, fcmErr.message);
          logToFile(`❌ FCM failed for ${deptName}: ${fcmErr.message}`, deptName);
        }

        // Optional: insert into log DB table
        try {
          await pool.request().query(`
            INSERT INTO NotificationLog (RoomNo, Department, BreachType, SentAt)
            VALUES ('${room}', '${deptName}', '${breachType}', GETDATE())
          `);
        } catch (logErr) {
          console.error(`❌ Log insert failed:`, logErr.message);
          logToFile(`❌ Log insert failed: ${logErr.message}`, deptName);
        }
      }
    }

    sql.close();
  } catch (err) {
    console.error('🔥 Error in sendSlaAlerts():', err.message);
  }
}

sendSlaAlerts();
