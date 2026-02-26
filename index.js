require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

const app = express();

// ================= LINE CONFIG =================
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

// ================= GOOGLE SHEETS CONFIG =================
const SPREADSHEET_ID = '1eXVw-PJMfluISSXpewOBJjuuPtx7t1vUhtPD3Q-tZUI';

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({
  version: 'v4',
  auth: auth
});

// ================= WEBHOOK =================
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// ================= EVENT HANDLER =================
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const text = event.message.text.trim();

  // ================= CREATE ISSUE =================
  if (text.startsWith('#issue')) {

    let issueText = text.replace('#issue', '').trim();

    if (!issueText) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'กรุณาระบุรายละเอียดหลัง #issue ด้วยครับ 🙏'
      });
    }

    const isUrgent = issueText.includes('#ด่วน');
    issueText = issueText.replace('#ด่วน', '').trim();
    const priority = isUrgent ? 'ด่วน' : 'ปกติ';

    const ticketNumber = 'T' + Date.now();
    const userId = event.source.userId;
    const sourceType = event.source.type;
    const now = new Date().toLocaleString('th-TH', {
  timeZone: 'Asia/Bangkok',
  dateStyle: 'medium',
  timeStyle: 'short'
});

    const profile = await client.getProfile(userId);
    const displayName = profile.displayName;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'issue!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          now,            // A Date
          ticketNumber,   // B TicketID
          userId,         // C
          displayName,    // D
          issueText,      // E
          'OPEN',         // F Status
          sourceType,     // G SourceType
          priority,       // H Priority
          '',             // I CompleteDate
          ''              // J Remark
        ]]
      }
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `รับ issue แล้ว 👨‍💻
เลข Ticket: ${ticketNumber}
วันที่แจ้ง: ${now}
ระดับความเร่งด่วน: ${priority}`
    });
  }

  // ================= CHECK STATUS =================
  if (text.startsWith('#status')) {

    const ticketId = text.replace('#status', '').trim();

    if (!ticketId) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'กรุณาระบุ TicketID เช่น #status T123456'
      });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'issue!A:J'
    });

    const rows = response.data.values || [];
    const ticketRow = rows.find(row => row[1] === ticketId);

    if (!ticketRow) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ไม่พบ Ticket นี้ ❌'
      });
    }

    const status = ticketRow[5] || '-';
    const completeDate = ticketRow[8] || '-';
    const remark = ticketRow[9] || '-';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `สถานะ: ${status}
วันที่แก้ไขเสร็จ: ${completeDate}
หมายเหตุ: ${remark}`
    });
  }

  return null;
}

// ================= SERVER =================
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
