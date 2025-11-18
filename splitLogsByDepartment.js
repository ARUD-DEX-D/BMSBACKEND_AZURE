const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
const dateStr = new Date().toISOString().slice(0, 10); // e.g., '2025-07-20'

const departmentLogs = {};

fs.readdirSync(logsDir).forEach(file => {
  if (file.startsWith(`sla_logs_${dateStr}`) && file.endsWith('.log')) {
    const fullPath = path.join(logsDir, file);

    let fileContent;
    try {
      fileContent = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      console.error(`[${new Date().toLocaleString()}] ❌ Failed to read ${file}: ${err.message}`);
      return;
    }

    // Improved regex to safely match department name
    const match = file.match(/Notification_sent_to_([A-Za-z0-9]+)/);
    if (!match) {
      console.warn(`[${new Date().toLocaleString()}] ⚠️ Could not extract department from: ${file}`);
      return;
    }

    const department = match[1];
    if (!departmentLogs[department]) departmentLogs[department] = [];

    departmentLogs[department].push(`[${new Date().toLocaleString()}] ${fileContent.trim()}`);
  }
});

// Write one file per department
for (const dept in departmentLogs) {
  const outputFile = path.join(logsDir, `${dept}_logs_${dateStr}.txt`);
  try {
    fs.writeFileSync(outputFile, departmentLogs[dept].join('\n\n'), 'utf8');
    console.log(`✅ Combined logs saved for ${dept} ➜ ${outputFile}`);
  } catch (err) {
    console.error(`❌ Failed to write log for ${dept}: ${err.message}`);
  }
}
