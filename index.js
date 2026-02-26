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

// ดึง JSON จาก Environment Variable
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

  if (event.message.text.startsWith('#issue')) {

    const issueText = event.message.text.replace('#issue', '').trim();
    const ticketNumber = 'T' + Date.now();

    // บันทึกลง Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'รับ issue!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString(), // Date
          ticketNumber,               // TicketID
          event.source.userId,        // UserId
          issueText,                  // Message
          'OPEN',                     // Status
          event.source.type           // Source (group/user)
        ]]
      }
    });

    // ตอบกลับในไลน์
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `รับ issue แล้ว เดี๋ยวจัดการให้ 👨‍💻\nเลข Ticket: ${ticketNumber}\n\nกรุณาไปติดตามงานกับบอทในแชทส่วนตัว`
    });
  }

  return null;
}

// ================= SERVER =================
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
