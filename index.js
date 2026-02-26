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

  if (!event.message.text.startsWith('#issue')) {
    return null;
  }

  const issueText = event.message.text.replace('#issue', '').trim();
  const ticketNumber = 'T' + Date.now();
  const userId = event.source.userId;
  const sourceType = event.source.type; // 👈 user / group / room

  // ดึงชื่อจาก LINE
  const profile = await client.getProfile(userId);
  const displayName = profile.displayName;

  // บันทึกลง Google Sheet
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'issue!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toLocaleString(), // A Date
        ticketNumber,                // B TicketID
        userId,                      // C UserId
        displayName,                 // D DisplayName
        issueText,                   // E Message
        'OPEN',                      // F Status
        sourceType                   // G SourceType
      ]]
    }
  });

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `รับ issue แล้ว 👨‍💻\nเลข Ticket: ${ticketNumber}`
  });
}

// ================= SERVER =================
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
