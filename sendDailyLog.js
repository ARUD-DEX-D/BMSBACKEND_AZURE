const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// 📁 Get today's log filename like sla_logs_2025-07-20.txt
function getTodayLogFilename() {
  const now = new Date();
  const dateString = now.toISOString().split('T')[0];
  return path.join(__dirname,'logs', `sla_logs_${dateString}__IT.txt`);
}

// 📧 Email setup (configure with your SMTP provider)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your SMTP service
  auth: {
    user: 'mail2arunss487@gmail.com',
    pass: 'lpwo ukdf eibw csrk' // Not your Gmail password; use App Passwords if using Gmail
  }
});

// 🕗 Schedule task every day at 8:00 AM IST (2:30 AM UTC)
cron.schedule('* * * * *', () => {
  const filePath = getTodayLogFilename();

  if (fs.existsSync(filePath)) {
    console.log(`[${new Date().toLocaleString()}] 📤 Sending daily log file...`);

    const mailOptions = {
      from: '"SLA Monitor"mail2arunss487@gmail.com',
      to: 'abhilashps05@gmail.com',
      subject: 'Daily SLA Breach Log',
      text: 'Attached is the SLA log for today.',
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath
        }
      ]
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('❌ Email sending failed:', error);
      } else {
        console.log('✅ Email sent:', info.response);
      }
    });

  } else {
    console.warn(`⚠️ No log file found for today: ${filePath}`);
  }
});
