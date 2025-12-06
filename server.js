require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');   // Works on Azure

const app = express();          // ✅ Initialize app first
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());        // ✅ Now it's safe

// const dbConfig = {
//   server: 'DESKTOP-QSJC5FP',
//   database: 'BED_TRACKING_SYSTEM',
//   driver: 'msnodesqlv8',
//   options: {
//     trustedConnection: true
//   }
// };

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,   // example: bmsdbserver.database.windows.net
  database: process.env.DB_NAME,
  options: {
    encrypt: true,         // Required for Azure SQL
    trustServerCertificate: false
  }
};


console.log('Connecting to:', process.env.DB_SERVER);

// ✅ Test DB connection at startup
sql.connect(dbConfig)
  .then(() => console.log('✅ Connected to cloud MSSQL'))
  .catch(err => console.error('❌ DB Connection Failed:', err));

// ✅ POST /insert
app.post('/insert', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const pool = await sql.connect(dbConfig);
    await pool.request()
      .input('name', sql.NVarChar(100), name)
      .query('INSERT INTO Person (Name) VALUES (@name)');

    res.json({ success: true, message: 'Inserted successfully' });
  } catch (err) {
    console.error('❌ Insert Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET /people
app.get('/people', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
    SELECT
    F.FACILITY_TID,
    F.MRNO,
  F.FACILITY_CKD_ROOMNO,
  F.FACILITY_CKD_DEPT,
  F.USERID,
  U.USERNAME,  -- Get the name from user master
  F.DISC_RECOM_TIME,
  F.ASSIGNED_TIME,
  F.COMPLETED_TIME,
  F.STATUS,
  F.TKT_STATUS,
  D.AssignSLA_Min,
  D.CompletionSLA_Min
FROM FACILITY_CHECK_DETAILS F 
JOIN Facility_Dept_Master D 
  ON F.FACILITY_CKD_DEPT = D.DEPTName
LEFT JOIN LOGIN U 
  ON F.USERID = U.USERID 
 
    `);

    res.json(result.recordset); // ✅ returns list of objects to Flutter
  } catch (err) {
    console.error('❌ /people error:', err);
    res.status(500).json({ error: 'Failed to fetch SLA data' });
  }
});























// ✅ GET /person/:id
app.get('/person/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM login WHERE USERID = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Fetch by ID Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST /register
app.post('/register', async (req, res) => {
  const { USERNAME, DEPT, USERID, PASSWORD, FCM_TOKEN } = req.body;

  if (!USERNAME || !DEPT || !USERID || !PASSWORD) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    await pool.request()
      .input('USERNAME', sql.NVarChar(100), USERNAME)
      .input('DEPT', sql.NVarChar(100), DEPT)
      .input('USERID', sql.NVarChar(100), USERID)
      .input('PASSWORD', sql.NVarChar(100), PASSWORD)
      .input('FCM_TOKEN', sql.NVarChar(sql.MAX), FCM_TOKEN || null) // ✅ Accept null if not present
      .query(`
        INSERT INTO login (USERNAME, DEPT, USERID, PASSWORD, FCM_TOKEN)
        VALUES (@USERNAME, @DEPT, @USERID, @PASSWORD, @FCM_TOKEN)
      `);

    res.json({ success: true, message: 'Inserted successfully' });
  } catch (err) {
    console.error('❌ Register Error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ POST /login
app.post('/login', async (req, res) => {
  const { USERID, PASSWORD } = req.body;

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('USERID', sql.VarChar, USERID)
      .input('PASSWORD', sql.VarChar, PASSWORD)
      .query('SELECT * FROM login WHERE USERID = @USERID AND PASSWORD = @PASSWORD');

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      res.status(200).json({
        message: 'Login successful',
        userid: user.USERID,
        name: user.USERNAME,
        department: user.DEPT
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


app.post('/close-ticket', async (req, res) => {
  let { ROOMNO, USERID, DEPT, FTID } = req.body;

  ROOMNO = ROOMNO?.toString().trim();
  USERID = USERID?.toString().trim();
  DEPT = DEPT?.toString().trim();
  FTID = FTID?.toString().trim();

  if (!ROOMNO || !USERID || !DEPT || !FTID) {
    return res.status(400).json({ error: 'ROOMNO, DEPT, USERID and FTID are required' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    // Fetch SLA related data
    const result = await pool.request()
      .input('ROOMNO', sql.NVarChar(100), ROOMNO)
      .input('DEPT', sql.NVarChar(100), DEPT)
      .input('FTID', sql.NVarChar(100), FTID)
      .query(`
        SELECT 
          F.DISC_RECOM_TIME, 
          F.ASSIGNED_TIME,
          D.AssignSLA_Min,
          D.CompletionSLA_Min
        FROM FACILITY_CHECK_DETAILS F
        JOIN Facility_Dept_Master D 
            ON LTRIM(RTRIM(F.FACILITY_CKD_DEPT)) = LTRIM(RTRIM(D.DEPTName))
        WHERE LTRIM(RTRIM(F.FACILITY_CKD_ROOMNO)) = @ROOMNO
          AND LTRIM(RTRIM(F.FACILITY_CKD_DEPT)) = @DEPT
          AND LTRIM(RTRIM(F.FACILITY_TID)) = @FTID
          AND F.TKT_STATUS != 2
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Ticket not found or already closed.' });
    }

    const row = result.recordset[0];
    const disc = new Date(row.DISC_RECOM_TIME);
    const assigned = row.ASSIGNED_TIME ? new Date(row.ASSIGNED_TIME) : null;
    const completed = new Date();

    const assignDeadline = new Date(disc.getTime() + row.AssignSLA_Min * 60000);
    const completeDeadline = new Date(disc.getTime() + row.CompletionSLA_Min * 60000);

    let slaStatus = 0;

    const assignExceeded = assigned && assigned > assignDeadline;
    const completeExceeded = completed > completeDeadline;

    if (!assigned) slaStatus = 0;
    else if (assignExceeded && completeExceeded) slaStatus = 4;
    else if (assignExceeded) slaStatus = 2;
    else if (completeExceeded) slaStatus = 3;
    else slaStatus = 5;

    // UPDATE 1: Close ticket
    await pool.request()
      .input('ROOMNO', sql.NVarChar(100), ROOMNO)
      .input('DEPT', sql.NVarChar(100), DEPT)
      .input('FTID', sql.NVarChar(100), FTID)
      .input('USERID', sql.NVarChar(100), USERID)
      .input('STATUS', sql.Int, slaStatus)
      .input('TKT_STATUS', sql.Int, 2)
      .query(`
        UPDATE FACILITY_CHECK_DETAILS
        SET 
          COMPLETED_TIME = DATEADD(MINUTE, 330, GETUTCDATE()),
          USERID = @USERID,
          STATUS = @STATUS,
          TKT_STATUS = @TKT_STATUS
        WHERE LTRIM(RTRIM(FACILITY_CKD_ROOMNO)) = @ROOMNO
          AND LTRIM(RTRIM(FACILITY_CKD_DEPT)) = @DEPT
          AND LTRIM(RTRIM(FACILITY_TID)) = @FTID
          AND TKT_STATUS != 2
      `);

    // 🔥 UPDATE 2: Update BED_DETAILS.IT = 1
    await pool.request()
      .input('ROOMNO', sql.NVarChar(100), ROOMNO)
      .input('FTID', sql.NVarChar(100), FTID)
      .query(`
        UPDATE BED_DETAILS
        SET IT = 1
        WHERE LTRIM(RTRIM(ROOMNO)) = @ROOMNO
          AND LTRIM(RTRIM(FTID)) = @FTID
      `);

    return res.json({
      success: true,
      message: 'Ticket closed successfully',
      slaStatus
    });

  } catch (err) {
    console.error('Close Ticket Error:', err);
    return res.status(500).json({ error: err.message });
  }
});







app.post('/assign', async (req, res) => {
  const { userid, status, roomNo, department, forceReassign } = req.body;

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('roomNo', sql.NVarChar, roomNo)
      .input('department', sql.NVarChar, department)
      .query(`
        SELECT STATUS, userid FROM FACILITY_CHECK_DETAILS
        WHERE FACILITY_CKD_ROOMNO = @roomNo AND FACILITY_CKD_DEPT = @department
      `);

    if (result.recordset.length === 0) {
      return res.status(404).send({ error: 'Record not found' });
    }

    const current = result.recordset[0];

    if (current.STATUS === 0 || current.STATUS === null) {
      // ✅ First-time assign
      await pool.request()
        .input('userid', sql.NVarChar, userid)
        .input('roomNo', sql.NVarChar, roomNo)
        .input('department', sql.NVarChar, department)
        .query(`
          UPDATE FACILITY_CHECK_DETAILS
          SET 
            ASSIGNED_TIME = DATEADD(MINUTE, 330, GETUTCDATE()),
            STATUS = 1,
            userid = @userid
          WHERE FACILITY_CKD_ROOMNO = @roomNo AND FACILITY_CKD_DEPT = @department
        `);

      return res.send({ success: true, message: 'Assigned successfully.' });

    } else if (current.STATUS === 1 && !forceReassign) {
      // ⚠️ Already assigned - prompt reassign
     return res.send({
  alreadyAssigned: true,
  currentUser: (current.userid ?? '').toString().trim(),
  message: `Already assigned to ${(current.userid ?? '').toString().trim()}. Do you want to reassign?`
});


    } else if (current.STATUS === 1 && forceReassign) {
      // ✅ Reassign (update only userid)
      await pool.request()
        .input('userid', sql.NVarChar, userid)
        .input('roomNo', sql.NVarChar, roomNo)
        .input('department', sql.NVarChar, department)
        .query(`
          UPDATE FACILITY_CHECK_DETAILS
          SET userid = @userid
          WHERE FACILITY_CKD_ROOMNO = @roomNo AND FACILITY_CKD_DEPT = @department
        `);

      return res.send({ success: true, message: 'User reassigned.' });

    } else {
      return res.status(400).send({ error: 'Cannot assign. Task already completed or SLA breached.' });
    }

  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});








// 🛠️ API to check SLA and send notifications
app.get('/check-sla', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT  F.FACILITY_CKD_ROOMNO, F.DISC_RECOM_TIME, F.ASSIGNED_TIME, F.COMPLETED_TIME, F.STATUS,
             D.AssignSLA_Min, D.CompletionSLA_Min, F.FCM_TOKEN
      FROM FACILITY_CHECK_DETAILS F
      INNER JOIN Facility_Dept_Master D ON F.FACILITY_CKD_DEPT = D.DEPTName
      WHERE F.STATUS IN (0, 1)
    `);

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    let assignBreachCount = 0;
    let completeBreachCount = 0;

    for (const row of result.recordset) {
      const disc = new Date(row.DISC_RECOM_TIME);
      const assigned = row.ASSIGNED_TIME ? new Date(row.ASSIGNED_TIME) : null;
      const completed = row.COMPLETED_TIME ? new Date(row.COMPLETED_TIME) : null;

      const assignDeadline = new Date(disc.getTime() + row.AssignSLA_Min * 60000);
      const completeDeadline = new Date(disc.getTime() + row.CompletionSLA_Min * 60000);

      if (!assigned && now > assignDeadline) {
        assignBreachCount++;
        if (row.FCM_TOKEN) {
          await sendNotification(
            row.FCM_TOKEN,
            '🚨 SLA1 Breach',
            `Room ${row.FACILITY_CKD_ROOMNO} not assigned within SLA`
          );
        }
      }

      if (assigned && !completed && now > completeDeadline) {
        completeBreachCount++;
        if (row.FCM_TOKEN) {
          await sendNotification(
            row.FCM_TOKEN,
            '⏰ SLA2 Breach',
            `Room ${row.FACILITY_CKD_ROOMNO} assigned but not completed within SLA`
          );
        }
      }
    }

    res.json({
      status: 'done',
      assignBreachNotified: assignBreachCount,
      completeBreachNotified: completeBreachCount,
    });
  } catch (err) {
    console.error('❌ DB Error:', err);
    res.status(500).json({ error: 'SLA check failed', details: err.message });
  }
});

app.post('/update-token', async (req, res) => {
  const { USERID, FCM_TOKEN } = req.body;

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('USERID', sql.VarChar, USERID)
      .input('FCM_TOKEN', sql.VarChar, FCM_TOKEN)
      .query(`
        UPDATE LOGIN
        SET FCM_TOKEN = @FCM_TOKEN
        WHERE USERID = @USERID
      `);

    // ✅ Check if any row was updated
    if (result.rowsAffected[0] > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: `USERID '${userId}' not found` });
    }
  } catch (err) {
    console.error('❌ Error updating token:', err);
    res.status(500).json({ error: 'Failed to update token' });
  }
});




// GET /notifications/:department/today
app.get('/notifications/:department/today', async (req, res) => {
  const department = req.params.department;

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('DeptName', sql.NVarChar(100), department)
      .query(`
        SELECT * FROM SLA_Notifications
        WHERE DeptName = @DeptName
          AND CONVERT(date, BreachDateTime) = CONVERT(date, GETDATE())
        ORDER BY BreachDateTime DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching today\'s notifications:', err);
    res.status(500).json({ error: 'Server error' });
  }
});




// API for Nursing Discharge Task ===========================================

app.post('/api/getnursingdischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !DEPT) {
        return res.status(400).json({ message: 'ROOMNO, MRNO, FTID, and DEPT are required' });
    }

    // ✅ Steps definition
    const steps = [
        { key: "PHARMACY_CLEARANCE", table: "DT_P1_NURSE_STATION", statusColumn: "PHARMACY_CLEARANCE", timeColumn: "PHARMACY_CLEARANCE_TIME", doneValue: [1] },
        { key: "LAB_CLEARANCE", table: "DT_P1_NURSE_STATION", statusColumn: "LAB_CLEARANCE", timeColumn: "LAB_CLEARANCE_TIME", doneValue: [1] },
        { key: "CONSUMABLE_CLEARANCE", table: "DT_P1_NURSE_STATION", statusColumn: "CONSUMABLE_CLEARANCE", timeColumn: "CONSUMABLE_CLEARANCE_TIME", doneValue: [1] },
        { key: "FILE_TRANSFERRED", table: "FACILITY_CHECK_DETAILS", statusColumn: "TKT_STATUS", timeColumn: null, doneValue: [0,1,2], facility: true },
        { key: "PATIENT_CHECKOUT", table: "BED_DETAILS", statusColumn: "STATUS", timeColumn: null, doneValue: [0] }
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};
        let nextStep = null;

        for (let step of steps) {
            let query;
            let request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            if (step.facility) {
                query = `
                    SELECT ${step.statusColumn} AS status
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FACILITY_TID)) = @ftid
                      AND RTRIM(LTRIM(FACILITY_CKD_DEPT)) = 'SUMMARY'
                `;
            } else {
                query = `
                    SELECT ${step.statusColumn} AS status${step.timeColumn ? `, ${step.timeColumn} AS time` : ''}
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FTID)) = @ftid
                `;
            }

            const result = await request.query(query);
            const row = result.recordset[0];

            let done = false;
            if (row) {
                // ✅ Check if doneValue is an array or single number
                if (Array.isArray(step.doneValue)) {
                    done = step.doneValue.includes(Number(row.status));
                } else {
                    done = Number(row.status) === step.doneValue;
                }
            }

            resultObj[step.key] = {
                status: done,
                time: step.timeColumn && row ? convertToIST(row.time) : null
            };

            // Assign nextStep only for the first pending step
            if (!done && !nextStep) nextStep = step.key;
        }

        resultObj["nextStep"] = nextStep; // only the first pending step
        res.json(resultObj);

    } catch (err) {
        console.error("❌ Nursing Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});















app.post('/api/UPDATE_NURSING_WORKFLOW', async (req, res) => {
    const { ROOMNO, MRNO, FTID, steps, user, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !steps) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        // IST Timestamp
        const now = new Date();
        now.setHours(now.getHours() + 5, now.getMinutes() + 30);
        const formattedTime = now.toISOString().replace('T', ' ').split('.')[0];

        // Step functions map
        const stepFunctions = {
            PHARMACY_CLEARANCE: async () => {
                const check = await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        SELECT PHARMACY_CLEARANCE AS curr
                        FROM DT_P1_NURSE_STATION
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);

                if (!(check.recordset.length && Number(check.recordset[0].curr) === 1)) {
                    await pool.request()
                        .input("value", sql.Int, 1)
                        .input("time", sql.VarChar, formattedTime)
                        .input("user", sql.VarChar, user)
                        .input("roomno", sql.VarChar, ROOMNO)
                        .input("mrno", sql.VarChar, MRNO)
                        .input("ftid", sql.VarChar, FTID)
                        .query(`
                            UPDATE DT_P1_NURSE_STATION
                            SET PHARMACY_CLEARANCE=@value,
                                PHARMACY_CLEARANCE_TIME=@time,
                                [USER]=@user
                            WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                              AND RTRIM(LTRIM(MRNO))=@mrno
                              AND RTRIM(LTRIM(FTID))=@ftid
                        `);
                }
            },

            LAB_CLEARANCE: async () => {
                const check = await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        SELECT LAB_CLEARANCE AS curr
                        FROM DT_P1_NURSE_STATION
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);

                if (!(check.recordset.length && Number(check.recordset[0].curr) === 1)) {
                    await pool.request()
                        .input("value", sql.Int, 1)
                        .input("time", sql.VarChar, formattedTime)
                        .input("user", sql.VarChar, user)
                        .input("roomno", sql.VarChar, ROOMNO)
                        .input("mrno", sql.VarChar, MRNO)
                        .input("ftid", sql.VarChar, FTID)
                        .query(`
                            UPDATE DT_P1_NURSE_STATION
                            SET LAB_CLEARANCE=@value,
                                LAB_CLEARANCE_TIME=@time,
                                [USER]=@user
                            WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                              AND RTRIM(LTRIM(MRNO))=@mrno
                              AND RTRIM(LTRIM(FTID))=@ftid
                        `);
                }
            },

            CONSUMABLE_CLEARANCE: async () => {
                const check = await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        SELECT CONSUMABLE_CLEARANCE AS curr
                        FROM DT_P1_NURSE_STATION
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);

                if (!(check.recordset.length && Number(check.recordset[0].curr) === 1)) {
                    await pool.request()
                        .input("value", sql.Int, 1)
                        .input("time", sql.VarChar, formattedTime)
                        .input("user", sql.VarChar, user)
                        .input("roomno", sql.VarChar, ROOMNO)
                        .input("mrno", sql.VarChar, MRNO)
                        .input("ftid", sql.VarChar, FTID)
                        .query(`
                            UPDATE DT_P1_NURSE_STATION
                            SET CONSUMABLE_CLEARANCE=@value,
                                CONSUMABLE_CLEARANCE_TIME=@time,
                                [USER]=@user
                            WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                              AND RTRIM(LTRIM(MRNO))=@mrno
                              AND RTRIM(LTRIM(FTID))=@ftid
                        `);
                }
            },

            FILE_TRANSFERRED: async () => {
                // STEP 1 → Open SUMMARY ticket
                await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE FACILITY_CHECK_DETAILS
                        SET TKT_STATUS = 0
                        WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                          AND RTRIM(LTRIM(FACILITY_CKD_DEPT))='SUMMARY'
                    `);

                // STEP 2 → Close NURSING ticket
                await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE FACILITY_CHECK_DETAILS
                        SET TKT_STATUS = 2
                        WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                          AND RTRIM(LTRIM(FACILITY_CKD_DEPT))='NURSING'
                    `);

              
               
                    await pool.request()
                        .input("roomno", ROOMNO)
                        .input("mrno", MRNO)
                        .input("ftid", FTID)
                        .query(`
                            UPDATE BED_DETAILS
                            SET NURSING = 1
                            WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                              AND RTRIM(LTRIM(MRNO))=@mrno
                              AND RTRIM(LTRIM(FTID))=@ftid
                        `);
                
            },

            PATIENT_CHECKOUT: async () => {
                await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO.trim())
                    .input("mrno", sql.VarChar, MRNO.trim())
                    .input("ftid", sql.VarChar, FTID.trim())
                    .query(`
                        UPDATE BED_DETAILS
                        SET STATUS = 3
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                          AND STATUS<>0
                    `);
            }
        };

        // 🔹 Loop only requested steps
        for (const key in steps) {
            if (steps[key] && stepFunctions[key]) {
                await stepFunctions[key]();
            }
        }

        res.json({
            message: "Workflow updated successfully"
        });

    } catch (err) {
        console.error("❌ WORKFLOW ERROR:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});


















































































///////////////////////PHARMACY DEPARTMENT/////////////////////////////////////////////





// API for FETCH D-TRACKER PHARMACY TASK STATUS ===========================================
//==============START===================================================================//


function convertToIST(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue); // stored UTC
    const istOffset = 5.5 * 60; // minutes
    const istDate = new Date(date.getTime() + istOffset * 60 * 1000);

    return istDate.getDate().toString().padStart(2,'0') + '-' +
           (istDate.getMonth()+1).toString().padStart(2,'0') + '-' +
           istDate.getFullYear() + ' ' +
           istDate.getHours().toString().padStart(2,'0') + ':' +
           istDate.getMinutes().toString().padStart(2,'0') + ':' +
           istDate.getSeconds().toString().padStart(2,'0');
}

app.post('/api/getpharmacydischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID } = req.body;
    if (!ROOMNO || !MRNO || !FTID) 
        return res.status(400).json({ message: 'ROOMNO, MRNO, and FTID are required' });

    const steps = [
        { key: "FILE_SIGNIN", table: "DT_P3_PHARMACY", statusColumn: "FILE_SIGNIN", timeColumn: "FILE_SIGNIN_TIME", statusValue: 1 },
        { key: "PHARMACY_FILE_INITIATION", table: "DT_P3_PHARMACY", statusColumn: "PHARMACY_FILE_INITIATION", timeColumn: "PHARMACY_FILE_INITIATION_TIME", statusValue: 1 },
        { key: "PHARMACY_COMPLETED", table: "DT_P3_PHARMACY", statusColumn: "PHARMACY_COMPLETED", timeColumn: "PHARMACY_COMPLETED_TIME", statusValue: 1 },
        { key: "FILE_DISPATCHED", table: "DT_P3_PHARMACY", statusColumn: "FILE_DISPATCHED", timeColumn: "FILE_DISPATCHED_TIME", statusValue: 1 }
         
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};
        let nextStep = null;

        for (let step of steps) {
            const query = `
                SELECT ${step.statusColumn} AS status, ${step.timeColumn} AS time
                FROM ${step.table}
                WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                  AND RTRIM(LTRIM(MRNO)) = @mrno
                  AND RTRIM(LTRIM(FTID)) = @ftid
            `;

            const request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const row = result.recordset[0];
                const status = Number(row.status) === step.statusValue;
                resultObj[step.key] = {
                    status,
                    time: convertToIST(row.time)
                };

                // If not completed and nextStep not assigned yet
                if (!status && !nextStep) {
                    nextStep = step.key;
                }
            } else {
                resultObj[step.key] = { status: false, time: null };
                if (!nextStep) nextStep = step.key;
            }
        }

        // Include next pending step
        resultObj["nextStep"] = nextStep;

        res.json(resultObj);

    } catch (err) {
        console.error("❌ Pharmacy Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});


// API for FETCH D-TRACKER PHARMACY TASK STATUS ===========================================
//========================END=============================================================//




//=========UPDATE D-TRACKER PHARMACY TASK ==============================================
//==============START===================================================================//
app.post('/api/UPDATE_DTRACK_PHARMACYSTEP', async (req, res) => {
    const { table, column, roomno, mrno, ftid, value, time, user } = req.body;

    if (!table || !column || !roomno || !mrno || !ftid) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const pool = await sql.connect(dbConfig);

        const query = `
            UPDATE ${table}
            SET ${column} = @value,
                ${column}_TIME = @time,
                [USER] = @user
            WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
              AND RTRIM(LTRIM(MRNO)) = @mrno
              AND RTRIM(LTRIM(FTID)) = @ftid
        `;

        const request = pool.request()
            .input('value', sql.Int, value)
            .input('time', sql.VarChar, time)
            .input('user', sql.VarChar, user ?? 'SYSTEM')
            .input('roomno', sql.VarChar, roomno.trim())
            .input('mrno', sql.VarChar, mrno.trim())
            .input('ftid', sql.VarChar, ftid.trim());

        await request.query(query);

        res.status(200).json({ message: "Step updated successfully", time });

    } catch (err) {
        console.log("❌ Update Pharmacy Step Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

//=========UPDATE D-TRACKER PHARMACY TASK ============================================
//==============END===================================================================






//========= UPDATE_BED_DETAILS_PHARMACY_TASK FOR SHOWING IN DASHBOARD =====================
//==============START===================================================================//

app.post('/api/UPDATE_BED_DETAILS_PHARMACY_TASK', async (req, res) => {
    const { ROOMNO, MRNO, FTID } = req.body;

    if (!ROOMNO || !MRNO || !FTID) {
        return res.status(400).json({ message: "ROOMNO, MRNO, FTID are required" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        const query = `
            UPDATE BED_DETAILS 
            SET PHARMACY = 1
            WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
              AND RTRIM(LTRIM(MRNO)) = @mrno
              AND RTRIM(LTRIM(FTID)) = @ftid
        `;

        await pool.request()
            .input("roomno", sql.VarChar, ROOMNO.trim())
            .input("mrno", sql.VarChar, MRNO.trim())
            .input("ftid", sql.VarChar, FTID.trim())
            .query(query);

        res.json({ message: "BED_DETAILS updated successfully" });

    } catch (err) {
        console.error("❌ BED_DETAILS Update Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

//========= UPDATE_BED_DETAILS_PHARMACY_TASK FOR SHOWING IN DASHBOARD =====================
//==============END===================================================================//







//========= CLOSE PHARMACY TICKET IN FACILITY_CHECK_DETAILS TABLE =====================
//==============START===================================================================//

app.post('/api/CLOSE_PHARMACY_TICKET', async (req, res) => {
    const { MRNO, FTID, DEPARTMENT } = req.body;

    if (!MRNO || !FTID || !DEPARTMENT) {
        return res.status(400).json({ message: "MRNO, FTID & DEPARTMENT are required" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        const query = `
            UPDATE FACILITY_CHECK_DETAILS
            SET TKT_STATUS = 2
            WHERE RTRIM(LTRIM(MRNO)) = @mrno
              AND RTRIM(LTRIM(FACILITY_TID)) = @ftid
              AND RTRIM(LTRIM(FACILITY_CKD_DEPT)) = @department
        `;

        await pool.request()
            .input("mrno", sql.VarChar, MRNO.trim())
            .input("ftid", sql.VarChar, FTID.trim())
            .input("department", sql.VarChar, DEPARTMENT.trim())
            .query(query);

        res.json({ message: "Ticket closed successfully" });

    } catch (err) {
        console.error("❌ Close Ticket Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});



//========= CLOSE PHARMACY TICKET IN FACILITY_CHECK_DETAILS TABLE =====================
//==============END===================================================================//



///////////////////////PHARMACY DEPARTMENT/////////////////////////////////////////////













///////////////////////SUMMARY DEPARTMENT/////////////////////////////////////////////


app.post('/api/getsummarydischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !DEPT) {
        return res.status(400).json({ message: 'ROOMNO, MRNO, FTID, and DEPT are required' });
    }

    // ✅ Steps definition
    const steps = [
        { key: "FILE_SIGNIN", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "FILE_SIGNIN", timeColumn: "FILE_SIGNIN_TIME", doneValue: [1] },
        { key: "SUMMARY_FILE_INITIATION", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "SUMMARY_FILE_INITIATION", timeColumn: "SUMMARY_FILE_INITIATION_TIME", doneValue: [1] },
        { key: "PREPARE_SUMMARY_DRAFT", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "PREPARE_SUMMARY_DRAFT", timeColumn: "PREPARE_SUMMARY_DRAFT_TIME", doneValue: [1] },
        
        { key: "DOCTOR_AUTHORIZATION", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "DOCTOR_AUTHORIZATION", timeColumn: "DOCTOR_AUTHORIZATION_TIME", doneValue: [1] },
        { key: "SUMMARY_COMPLETED", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "SUMMARY_COMPLETED", timeColumn: "SUMMARY_COMPLETED_TIME", doneValue: [1] },
        { key: "FILE_DISPATCHED", table: "DT_P2_DISCHARGE_SUMMARY", statusColumn: "FILE_DISPATCHED", timeColumn: "FILE_DISPATCHED_TIME", doneValue: [1] },
        
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};
        let nextStep = null;

        for (let step of steps) {
            let query;
            let request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            if (step.facility) {
                query = `
                    SELECT ${step.statusColumn} AS status
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FACILITY_TID)) = @ftid
                      AND RTRIM(LTRIM(FACILITY_CKD_DEPT)) = 'PHARMACY'
                `;
            } else {
                query = `
                    SELECT ${step.statusColumn} AS status${step.timeColumn ? `, ${step.timeColumn} AS time` : ''}
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FTID)) = @ftid
                `;
            }

            const result = await request.query(query);
            const row = result.recordset[0];

            let done = false;
            if (row) {
                // ✅ Check if doneValue is an array or single number
                if (Array.isArray(step.doneValue)) {
                    done = step.doneValue.includes(Number(row.status));
                } else {
                    done = Number(row.status) === step.doneValue;
                }
            }

            resultObj[step.key] = {
                status: done,
                time: step.timeColumn && row ? convertToIST(row.time) : null
            };

            // Assign nextStep only for the first pending step
            if (!done && !nextStep) nextStep = step.key;
        }

        resultObj["nextStep"] = nextStep; // only the first pending step
        res.json(resultObj);

    } catch (err) {
        console.error("❌ Nursing Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});










app.post('/api/UPDATE_SUMMARY_WORKFLOW', async (req, res) => {
    const { ROOMNO, MRNO, FTID, steps, user, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !steps) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        // IST Timestamp
        const now = new Date();
        now.setHours(now.getHours() + 5, now.getMinutes() + 30);
        const formattedTime = now.toISOString().replace('T', ' ').split('.')[0];

        // Step functions map for SUMMARY workflow
        const stepFunctions = {

            FILE_SIGNIN: async () => {
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET FILE_SIGNIN = @value,
                            FILE_SIGNIN_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                          AND RTRIM(LTRIM(MRNO)) = @mrno
                          AND RTRIM(LTRIM(FTID)) = @ftid
                    `);
            },

            SUMMARY_FILE_INITIATION: async () => {
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET SUMMARY_FILE_INITIATION = @value,
                            SUMMARY_FILE_INITIATION_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            PREPARE_SUMMARY_DRAFT: async () => {
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET PREPARE_SUMMARY_DRAFT = @value,
                            PREPARE_SUMMARY_DRAFT_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            DOCTOR_AUTHORIZATION: async () => {
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET DOCTOR_AUTHORIZATION = @value,
                            DOCTOR_AUTHORIZATION_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            SUMMARY_COMPLETED: async () => {
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET SUMMARY_COMPLETED = @value,
                            SUMMARY_COMPLETED_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            FILE_DISPATCHED: async () => {
                // Mark summary as dispatched
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE DT_P2_DISCHARGE_SUMMARY
                        SET FILE_DISPATCHED = @value,
                            FILE_DISPATCHED_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);

                // Optionally mark SUMMARY flag in BED_DETAILS
                await pool.request()
                    .input("roomno", sql.VarChar, ROOMNO)
                    .input("mrno", sql.VarChar, MRNO)
                    .input("ftid", sql.VarChar, FTID)
                    .query(`
                        UPDATE BED_DETAILS
                        SET DISCHARGE_SUMMARY = 1
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            }

        };

        // 🔹 Execute only selected steps
        for (const key in steps) {
            if (steps[key] && stepFunctions[key]) {
                await stepFunctions[key]();
            }
        }

        res.json({
            message: "SUMMARY workflow updated successfully"
        });

    } catch (err) {
        console.error("❌ SUMMARY WORKFLOW ERROR:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});


///////////////////////END SUMMARY DEPARTMENT/////////////////////////////////////////////


///////////////////////START BILLING DEPARTMENT/////////////////////////////////////////////

app.post('/api/UPDATE_BILLING_WORKFLOW', async (req, res) => {
    const { ROOMNO, MRNO, FTID, steps, user, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !steps) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        // IST Timestamp
        const now = new Date();
        now.setHours(now.getHours() + 5, now.getMinutes() + 30);
        const formattedTime = now.toISOString().replace('T', ' ').split('.')[0];

        // Step functions map for BILLING workflow
       const stepFunctions = {

    BILLING_FILE_SIGNIN: async () => {
        await pool.request()
            .input("value", sql.Int, 1)
            .input("time", sql.VarChar, formattedTime)
            .input("user", sql.VarChar, user)
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE DT_P4_BILLING
                SET BILLING_FILE_SIGNIN = @value,
                    BILLING_FILE_SIGNIN_TIME = @time,
                    [USER] = @user
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);
    },

    BILLING_FILE_INITIATION: async () => {
        await pool.request()
            .input("value", sql.Int, 1)
            .input("time", sql.VarChar, formattedTime)
            .input("user", sql.VarChar, user)
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE DT_P4_BILLING
                SET BILLING_FILE_INITIATION = @value,
                    BILLING_FILE_INITIATION_TIME = @time,
                    [USER] = @user
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);
    },

    BILLING_FILE_COMPLETED: async () => {
        await pool.request()
            .input("value", sql.Int, 1)
            .input("time", sql.VarChar, formattedTime)
            .input("user", sql.VarChar, user)
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE DT_P4_BILLING
                SET BILLING_FILE_COMPLETED = @value,
                    BILLING_FILE_COMPLETED_TIME = @time,
                    [USER] = @user
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);
    },

    BILLING_FILE_DISPATCHED: async () => {
        // update main billing table
        await pool.request()
            .input("value", sql.Int, 1)
            .input("time", sql.VarChar, formattedTime)
            .input("user", sql.VarChar, user)
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE DT_P4_BILLING
                SET BILLING_FILE_DISPATCHED = @value,
                    BILLING_FILE_DISPATCHED_TIME = @time,
                    [USER] = @user
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);

        // close billing ticket
        await pool.request()
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE FACILITY_CHECK_DETAILS
                SET TKT_STATUS = 2
                WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                  AND FACILITY_CKD_DEPT='BILLING'
            `);

        // open insurance ticket
        await pool.request()
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE FACILITY_CHECK_DETAILS
                SET TKT_STATUS = 0
                WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                  AND FACILITY_CKD_DEPT='INSURANCE'
            `);

        // mark bed billing done
        await pool.request()
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                UPDATE BED_DETAILS
                SET BILLING = 1
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);
    }
};


        // 🔹 Execute only selected steps
        for (const key in steps) {
            if (steps[key] && stepFunctions[key]) {
                await stepFunctions[key]();
            }
        }

        res.json({ message: "Billing workflow updated successfully" });

    } catch (err) {
        console.error("❌ BILLING WORKFLOW ERROR:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});












app.post('/api/getbillingdischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !DEPT) {
        return res.status(400).json({ message: 'ROOMNO, MRNO, FTID, and DEPT are required' });
    }

    // Billing Steps Definition
    const steps = [
        { key: "BILLING_FILE_SIGNIN", table: "DT_P4_BILLING", statusColumn: "BILLING_FILE_SIGNIN", timeColumn: "BILLING_FILE_SIGNIN_TIME", doneValue: [1] },
        { key: "BILLING_FILE_INITIATION", table: "DT_P4_BILLING", statusColumn: "BILLING_FILE_INITIATION", timeColumn: "BILLING_FILE_INITIATION_time", doneValue: [1] },
        { key: "BILLING_FILE_COMPLETED", table: "DT_P4_BILLING", statusColumn: "BILLING_FILE_COMPLETED", timeColumn: "BILLING_FILE_COMPLETED_TIME", doneValue: [1] },
        { key: "BILLING_FILE_DISPATCHED", table: "DT_P4_BILLING", statusColumn: "BILLING_FILE_DISPATCHED", timeColumn: "BILLING_FILE_DISPATCHED_TIME", doneValue: [1] },
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};
        let nextStep = null;

        for (let step of steps) {

            let request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            const query = `
                SELECT ${step.statusColumn} AS status, ${step.timeColumn} AS time
                FROM ${step.table}
                WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                  AND RTRIM(LTRIM(MRNO)) = @mrno
                  AND RTRIM(LTRIM(FTID)) = @ftid
            `;

            const result = await request.query(query);
            const row = result.recordset[0];

            let done = false;
            if (row) {
                if (Array.isArray(step.doneValue)) {
                    done = step.doneValue.includes(Number(row.status));
                } else {
                    done = Number(row.status) === step.doneValue;
                }
            }

            resultObj[step.key] = {
                status: done,
                time: row?.time ? convertToIST(row.time) : null
            };

            if (!done && !nextStep) nextStep = step.key;
        }

        resultObj["nextStep"] = nextStep;

        res.json(resultObj);

    } catch (err) {
        console.error("❌ Billing Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});












app.post('/api/getinsurancedischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !DEPT) {
        return res.status(400).json({ message: 'ROOMNO, MRNO, FTID, and DEPT are required' });
    }

    // Insurance Steps
    const steps = [
        { key: "INSURANCE_FILE_SIGNIN", table: "DT_P5_INSURANCE", statusColumn: "INSURANCE_FILE_SIGNIN", timeColumn: "INSURANCE_FILE_SIGNIN_TIME", doneValue: [1] },
        { key: "INSURANCE_FILE_INITIATION", table: "DT_P5_INSURANCE", statusColumn: "INSURANCE_FILE_INITIATION", timeColumn: "INSURANCE_FILE_INITIATION_TIME", doneValue: [1] },
        { key: "INSURANCE_FILE_COMPLETED", table: "DT_P5_INSURANCE", statusColumn: "INSURANCE_FILE_COMPLETED", timeColumn: "INSURANCE_FILE_COMPLETED_TIME", doneValue: [1] },
        { key: "INSURANCE_FILE_DISPATCHED", table: "DT_P5_INSURANCE", statusColumn: "INSURANCE_FILE_DISPATCHED", timeColumn: "INSURANCE_FILE_DISPATCHED_TIME", doneValue: [1] },
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};
        let nextStep = null;

        for (let step of steps) {

            let request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            const query = `
                SELECT ${step.statusColumn} AS status, ${step.timeColumn} AS time
                FROM ${step.table}
                WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                  AND RTRIM(LTRIM(MRNO)) = @mrno
                  AND RTRIM(LTRIM(FTID)) = @ftid
            `;

            const result = await request.query(query);
            const row = result.recordset[0];

            let done = false;
            if (row) {
                if (Array.isArray(step.doneValue)) {
                    done = step.doneValue.includes(Number(row.status));
                } else {
                    done = Number(row.status) === step.doneValue;
                }
            }

            resultObj[step.key] = {
                status: done,
                time: row?.time ? convertToIST(row.time) : null
            };

            if (!done && !nextStep) nextStep = step.key;
        }

        resultObj["nextStep"] = nextStep;

        res.json(resultObj);

    } catch (err) {
        console.error("❌ Insurance Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});




app.post('/api/UPDATE_INSURANCE_WORKFLOW', async (req, res) => {
    const { ROOMNO, MRNO, FTID, steps, user, DEPT } = req.body;

    if (!ROOMNO || !MRNO || !FTID || !steps) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const pool = await sql.connect(dbConfig);

        // Convert to IST correctly
        const now = new Date();
        now.setHours(now.getHours() + 5);
        now.setMinutes(now.getMinutes() + 30);
        const formattedTime = now.toISOString().replace("T", " ").split(".")[0];

        // 🔍 Step 1: Check if insurance record exists
        const existsCheck = await pool.request()
            .input("roomno", ROOMNO)
            .input("mrno", MRNO)
            .input("ftid", FTID)
            .query(`
                SELECT * FROM DT_P5_INSURANCE
                WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                  AND RTRIM(LTRIM(MRNO))=@mrno
                  AND RTRIM(LTRIM(FTID))=@ftid
            `);

        if (existsCheck.recordset.length === 0) {
            return res.status(404).json({ 
                message: "No matching insurance record found. QR code mismatch." 
            });
        }

        // Step Update Functions
        const stepFunctions = {

            INSURANCE_FILE_SIGNIN: async () => {
                return await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE DT_P5_INSURANCE
                        SET INSURANCE_FILE_SIGNIN = @value,
                            INSURANCE_FILE_SIGNIN_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            INSURANCE_FILE_INITIATION: async () => {
                return await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE DT_P5_INSURANCE
                        SET INSURANCE_FILE_INITIATION = @value,
                            INSURANCE_FILE_INITIATION_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            INSURANCE_FILE_COMPLETED: async () => {
                return await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE DT_P5_INSURANCE
                        SET INSURANCE_FILE_COMPLETED = @value,
                            INSURANCE_FILE_COMPLETED_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            },

            INSURANCE_FILE_DISPATCHED: async () => {

                // Update insurance table
                await pool.request()
                    .input("value", sql.Int, 1)
                    .input("time", sql.VarChar, formattedTime)
                    .input("user", sql.VarChar, user)
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE DT_P5_INSURANCE
                        SET INSURANCE_FILE_DISPATCHED = @value,
                            INSURANCE_FILE_DISPATCHED_TIME = @time,
                            [USER] = @user
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);

                // Close Insurance Ticket
                await pool.request()
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE FACILITY_CHECK_DETAILS
                        SET TKT_STATUS = 2
                        WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                          AND FACILITY_CKD_DEPT='INSURANCE'
                    `);

                // Open Pharmacy Ticket
                await pool.request()
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE FACILITY_CHECK_DETAILS
                        SET TKT_STATUS = 0
                        WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FACILITY_TID))=@ftid
                          AND FACILITY_CKD_DEPT='PHARMACY'
                    `);

                // Update BED_DETAILS
                await pool.request()
                    .input("roomno", ROOMNO)
                    .input("mrno", MRNO)
                    .input("ftid", FTID)
                    .query(`
                        UPDATE BED_DETAILS
                        SET INSURANCE = 1
                        WHERE RTRIM(LTRIM(ROOMNO))=@roomno
                          AND RTRIM(LTRIM(MRNO))=@mrno
                          AND RTRIM(LTRIM(FTID))=@ftid
                    `);
            }
        };

        // 🔹 Execute selected steps
        for (const key in steps) {
            if (steps[key] && stepFunctions[key]) {
                await stepFunctions[key]();
            }
        }

        res.json({ message: "Insurance workflow updated successfully" });

    } catch (err) {
        console.error("❌ INSURANCE WORKFLOW ERROR:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});





// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
