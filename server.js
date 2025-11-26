require('dotenv').config();
const express = require('express');
const cors = require('cors');
//const sql = require('mssql/msnodesqlv8');
const sql = require('mssql');   // ✅ Works on Azure
app.use(express.json());   // ⭐ REQUIRED

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
//===============LOCAL CONNECTION CONFIG==========================
// const dbConfig = {
//   server: 'DESKTOP-QSJC5FP',
//   database: 'BED_TRACKING_SYSTEM',
//   driver: 'msnodesqlv8',
//   options: {
//     trustedConnection: true
//   }
// };
//===================================================================


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
  .then(() => console.log('✅ Connected to Azure SQL'))
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
  const { ROOMNO, USERID } = req.body;

  if (!ROOMNO || !USERID) {
    return res.status(400).json({ error: 'ROOMNO and USERID are required' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    // Step 1: Get DISC_RECOM_TIME, ASSIGNED_TIME, SLA values
    const result = await pool.request()
      .input('ROOMNO', sql.NVarChar(100), ROOMNO)
      .query(`
        SELECT 
          F.DISC_RECOM_TIME, 
          F.ASSIGNED_TIME, 
          F.COMPLETED_TIME,
          D.AssignSLA_Min, 
          D.CompletionSLA_Min
        FROM FACILITY_CHECK_DETAILS F
        JOIN Facility_Dept_Master D ON F.FACILITY_CKD_DEPT = D.DEPTName
        WHERE F.FACILITY_CKD_ROOMNO = @ROOMNO
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const row = result.recordset[0];

    const disc = new Date(row.DISC_RECOM_TIME);
    const assigned = row.ASSIGNED_TIME ? new Date(row.ASSIGNED_TIME) : null;
    const completed = new Date(); // Now
    const assignSLA = row.AssignSLA_Min;
    const completeSLA = row.CompletionSLA_Min;

    let newStatus = 0; // Default: not assigned

    if (!assigned && !completed) {
      newStatus = 0; // Not assigned, not completed
    } else {
      const assignDeadline = new Date(disc.getTime() + assignSLA * 60000);
      const completeDeadline = new Date(disc.getTime() + completeSLA * 60000);

      const assignExceeded = assigned && assigned > assignDeadline;

      if (!completed) {
        const completeExceeded = assigned && Date.now() > (assigned.getTime() + completeSLA * 60000);

        if (assignExceeded && completeExceeded) {
          newStatus = 4;
        } else if (assignExceeded) {
          newStatus = 2;
        } else if (completeExceeded) {
          newStatus = 3;
        } else {
          newStatus = 1;
        }
      } else {
        const completeExceeded = completed > completeDeadline;

        if (assignExceeded && completeExceeded) {
          newStatus = 4;
        } else if (assignExceeded) {
          newStatus = 2;
        } else if (completeExceeded) {
          newStatus = 3;
        } else {
          newStatus = 5; // ✅ Completed within SLA
        }
      }
    }

    // Step 2: Update the record with SLA status, status, ticket close
    const update = await pool.request()
      .input('ROOMNO', sql.NVarChar(100), ROOMNO)
      .input('USERID', sql.NVarChar(100), USERID)
      .input('TKT_STATUS', sql.Int, 1) // ✅ Closed
      .input('STATUS', sql.Int, newStatus) // ✅ SLA logic status
      .input('SLA_STATUS', sql.Int, newStatus) // ✅ Optional separate field
      .query(`
        UPDATE FACILITY_CHECK_DETAILS
        SET 
          COMPLETED_TIME = DATEADD(MINUTE, 330, GETUTCDATE()),
          USERID = @USERID,
          TKT_STATUS = @TKT_STATUS,
          STATUS =  @SLA_STATUS
        WHERE FACILITY_CKD_ROOMNO = @ROOMNO AND TKT_STATUS != 1
      `);

    if (update.rowsAffected[0] === 0) {
      return res.status(400).json({ message: 'Ticket already closed or not found.' });
    }

    return res.json({
      success: true,
      message: 'Ticket closed successfully.',
      status: newStatus
    });

  } catch (err) {
    console.error('❌ Close Ticket Error:', err);
    res.status(500).json({ error: err.message });
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

    const steps = [
        { key: 'PHARMACY_CLEARANCE', table: 'DT_P1_NURSE_STATION', column: 'PHARMACY_CLEARANCE', statusValue: 1 },
        { key: 'LAB_CLEARANCE', table: 'DT_P1_NURSE_STATION', column: 'LAB_CLEARANCE', statusValue: 1 },
        { key: 'CONSUMABLE_CLEARANCE', table: 'DT_P1_NURSE_STATION', column: 'CONSUMABLE_CLEARANCE', statusValue: 1 },
        { key: 'PATIENT_CHECKOUT', table: 'BED_DETAILS', column: 'STATUS', statusValue: 3 },
        // ⭐ Facility check step
        { key: 'FILE TRANSFRED TO DS', table: 'FACILITY_CHECK_DETAILS', column: 'TKT_STATUS', statusValue:[0, 1, 2], facility: true }
    ];

    try {
        let pool = await sql.connect(dbConfig);
        let resultObj = {};

        for (let step of steps) {
            let query;

            if (step.facility) {
                query = `
                    SELECT ${step.column} AS status
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(FACILITY_CKD_ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FACILITY_TID)) = @ftid
                      AND RTRIM(LTRIM(FACILITY_CKD_DEPT)) = @dept
                `;
            } else {
                query = `
                    SELECT ${step.column} AS status
                    FROM ${step.table}
                    WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
                      AND RTRIM(LTRIM(MRNO)) = @mrno
                      AND RTRIM(LTRIM(FTID)) = @ftid
                `;
            }

            let request = pool.request()
                .input('roomno', sql.VarChar, ROOMNO.trim())
                .input('mrno', sql.VarChar, MRNO.trim())
                .input('ftid', sql.VarChar, FTID.trim());

            if (step.facility) request.input('dept', sql.VarChar, DEPT.trim());

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const row = result.recordset[0];
                // ✅ Use row.status and return boolean for facility
                resultObj[step.key] = Number(row.status) === step.statusValue;
            } else {
                resultObj[step.key] = false;
            }
        }

        res.json(resultObj);

    } catch (err) {
        console.error('❌ Discharge Status Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});








//=========UPDATE D-TRACKER NURSE TASK =========

app.post('/api/updateD-TRACKNURSEStep', async (req, res) => {
    const { table, roomno, mrno, ftid, column, value } = req.body;

    if (!table || !roomno || !mrno || !ftid || !column) {
        return res.status(400).json({
            message: "table, roomno, mrno, ftid, and column are required"
        });
    }

    try {
        let pool = await sql.connect(dbConfig);

        const query = `
            UPDATE ${table}
            SET ${column} = @value
            WHERE RTRIM(LTRIM(ROOMNO)) = @roomno
              AND RTRIM(LTRIM(MRNO)) = @mrno
              AND RTRIM(LTRIM(FTID)) = @ftid
             
        `;

        await pool.request()
            .input("value", sql.Int, value)
            .input("roomno", sql.VarChar, roomno.trim())
            .input("mrno", sql.VarChar, mrno.trim())
            .input("ftid", sql.VarChar, ftid.trim())
            
            .query(query);

        res.json({ message: "Updated successfully" });

    } catch (err) {
        console.error("❌ Update Error:", err);
        res.status(500).json({
            message: "Server Error",
            error: err.message
        });
    }
});


//=========UPDATE D-TRACKER NURSE TASK =========





// API for PHARMACY Discharge Task ===========================================





app.post('/api/getpharmacydischargeStatus', async (req, res) => {
    const { ROOMNO, MRNO, FTID } = req.body;

    if (!ROOMNO || !MRNO || !FTID) {
        return res.status(400).json({ message: 'ROOMNO, MRNO, and FTID are required' });
    }

    // ⭐ IST time conversion
    function convertToIST(dateValue) {
        if (!dateValue) return null;

        const date = new Date(dateValue);
        const IST = new Date(date.getTime() + (5.5 * 60 * 60 * 1000)); // UTC + 5:30

        const formatted =
            IST.getDate().toString().padStart(2, '0') + '-' +
            (IST.getMonth() + 1).toString().padStart(2, '0') + '-' +
            IST.getFullYear() + ' ' +
            IST.getHours().toString().padStart(2, '0') + ':' +
            IST.getMinutes().toString().padStart(2, '0') + ':' +
            IST.getSeconds().toString().padStart(2, '0');

        return formatted;
    }

    // ⭐ Steps without DEPT
    const steps = [
        {
            key: "PHARMACY_FILE_INITIATION",
            table: "DT_P3_PHARMACY",
            statusColumn: "PHARMACY_FILE_INITIATION",
            timeColumn: "PHARMACY_FILE_INITIATION_TIME",
            statusValue: 1
        },
        {
            key: "PHARMACY_COMPLETED",
            table: "DT_P3_PHARMACY",
            statusColumn: "PHARMACY_COMPLETED",
            timeColumn: "PHARMACY_COMPLETED_TIME",
            statusValue: 1
        },
        {
            key: "FILE_DISPATCHED",
            table: "DT_P3_PHARMACY",
            statusColumn: "FILE_DISPATCHED",
            timeColumn: "FILE_DISPATCHED_TIME",
            statusValue: 1
        }
    ];

    try {
        const pool = await sql.connect(dbConfig);
        let resultObj = {};

        for (let step of steps) {
            const query = `
                SELECT 
                    ${step.statusColumn} AS status,
                    ${step.timeColumn} AS time
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

                resultObj[step.key] = {
                    status: Number(row.status) === step.statusValue,
                    time: convertToIST(row.time)
                };
            } else {
                resultObj[step.key] = {
                    status: false,
                    time: null
                };
            }
        }

        res.json(resultObj);

    } catch (err) {
        console.error("❌ Pharmacy Status Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});




// API for PHARMACY Discharge Task ===========================================







// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
