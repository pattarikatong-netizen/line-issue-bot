require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

const client = new line.Client(config);

// ====== GOOGLE SHEET SETUP ======
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// ใส่ Spreadsheet ID ของคุณตรงนี้
const SPREADSHEET_ID = 'ใส่_SPREADSHEET_ID_ตรงนี้';

// ====== FUNCTION ======
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  if (event.message.text.startsWith('#issue')) {

    const issueText = event.message.text.replace('#issue', '').trim();
    const ticketNumber = 'T' + Date.now();

    // บันทึกลง Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          ticketNumber,
          new Date().toLocaleString(),
          event.source.userId,
          issueText
        ]]
      }
    });

    // ตอบกลับในไลน์กลุ่ม
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `รับ issue แล้ว เดี๋ยวจัดการให้ 👨‍💻\nเลข Ticket: ${ticketNumber}\n\nกรุณาไปติดตามงานกับบอทในแชทส่วนตัว`
    });
  }

  return Promise.resolve(null);
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
