require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const cron = require('node-cron');

const app = express();

/* ================= LINE CONFIG ================= */
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

/* ================= GOOGLE SHEETS CONFIG ================= */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GROUP_ID = process.env.GROUP_ID;
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

/* ================= HELPER ================= */
async function getRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'issue!A:L'
  });
  return res.data.values || [];
}

/* ================= WEBHOOK ================= */
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

/* ================= EVENT HANDLER ================= */
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const text = event.message.text.trim();

  /* ===== CREATE ISSUE ===== */
  if (text.startsWith('#issue')) {

    let issueText = text.replace('#issue', '').trim();

    if (!issueText) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'กรุณาระบุรายละเอียดหลัง #issue'
      });
    }

    const isUrgent = issueText.includes('#ด่วน');
    issueText = issueText.replace('#ด่วน', '').trim();
    const priority = isUrgent ? 'ด่วน' : 'ปกติ';

    const ticketNumber = 'T' + Date.now();
    const userId = event.source.userId;
    const sourceType = event.source.type;

    const now = new Date();
    const nowText = now.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok'
    });

    let displayName = 'Unknown';

    try {
      if (sourceType === 'user') {
        const profile = await client.getProfile(userId);
        displayName = profile.displayName;
      } else if (sourceType === 'group') {
        const profile = await client.getGroupMemberProfile(
          event.source.groupId,
          userId
        );
        displayName = profile.displayName;
      }
    } catch (err) {
      console.log("Profile error:", err.message);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'issue!A:L',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          nowText,
          ticketNumber,
          userId,
          displayName,
          issueText,
          'OPEN',
          sourceType,
          priority,
          'รับเรื่องแล้ว',
          '',
          '',
          ''
        ]]
      }
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text:
        `✅ รับเรื่องแล้ว 🎉\n` +
        `เลข Ticket: ${ticketNumber}\n` +
        `วันที่แจ้ง: ${nowText}\n` +
        `ระดับความเร่งด่วน: ${priority}`
    });
  }

    /* ===== CHECK STATUS ===== */
  if (text.startsWith('#check') || text.startsWith('#status')) {

    const ticketId = text.split(' ')[1];

    if (!ticketId) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'กรุณาระบุเลข Ticket เช่น\n#check T1234567890'
      });
    }

    const rows = await getRows();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (row[1] === ticketId) {

        const created = row[0];
        const issueText = row[4];
        const mainStatus = row[5];
        const priority = row[7];
        const statusUpdate = row[8];
        const completeDate = row[9] || '-';
        const remark = row[10] || '-';

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text:
            `🎫 Ticket: ${ticketId}\n` +
            `📅 วันที่แจ้ง: ${created}\n` +
            `📌 เรื่อง: ${issueText}\n` +
            `🚦 ความเร่งด่วน: ${priority}\n` +
            `📊 สถานะหลัก: ${mainStatus}\n` +
            `📝 สถานะล่าสุด: ${statusUpdate}\n` +
            `📆 วันที่คาดว่าจะเสร็จ: ${completeDate}\n` +
            `📎 หมายเหตุ: ${remark}`
        });
      }
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `❌ ไม่พบ Ticket ${ticketId}`
    });
  }

  return null;
}
/* ================= 1️⃣ SLA CHECK (09:00) ================= */
cron.schedule('0 9 * * *', async () => {

  const rows = await getRows();
  const now = new Date();

  for (let i = 1; i < rows.length; i++) {

    const row = rows[i];

    const created = new Date(row[0]);
    const ticketId = row[1];
    const userId = row[2];
    const priority = row[7];
    const statusUpdate = row[8];
    const overFlag = row[11];

    if (statusUpdate === 'เสร็จสิ้น' || statusUpdate === 'ยกเลิก') continue;

    const diffDays = (now - created) / (1000 * 60 * 60 * 24);

    if (
      (priority === 'ปกติ' && diffDays >= 3) ||
      (priority === 'ด่วน' && diffDays >= 1)
    ) {
      if (!overFlag) {

        await client.pushMessage(userId, {
          type: 'text',
          text: `⏰ งานของคุณเกินกำหนด\nTicket: ${ticketId}`
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `issue!L${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['เกินกำหนด']]
          }
        });
      }
    }
  }

}, { timezone: "Asia/Bangkok" });

/* ================= 2️⃣ CHECK CLOSED (ทุก 5 นาที) ================= */
cron.schedule('*/5 * * * *', async () => {

  const rows = await getRows();

  for (let i = 1; i < rows.length; i++) {

    const row = rows[i];

    const ticketId = row[1];
    const userId = row[2];
    const statusUpdate = row[8];
    const mainStatus = row[5];

    if (
      (statusUpdate === 'เสร็จสิ้น' || statusUpdate === 'ยกเลิก') &&
      mainStatus !== 'CLOSED'
    ) {

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `issue!F${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['CLOSED']]
        }
      });

      await client.pushMessage(userId, {
        type: 'text',
        text:
          `✅ งานของคุณปิดแล้ว\n` +
          `Ticket: ${ticketId}\n` +
          `สถานะ: ${statusUpdate}`
      });
    }
  }

}, { timezone: "Asia/Bangkok" });

/* ================= 3️⃣ DAILY SUMMARY (17:00) ================= */
cron.schedule('0 17 * * *', async () => {

  const rows = await getRows();

  let newToday = 0;
  let doing = 0;
  let waiting = 0;
  let received = 0;

  const today = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok'
  });

  for (let i = 1; i < rows.length; i++) {

    const row = rows[i];
    const created = row[0] || '';
    const statusUpdate = row[8] || '';

    if (created.includes(today)) newToday++;
    if (statusUpdate === 'กำลังดำเนินการ') doing++;
    if (statusUpdate === 'รอข้อมูลเพิ่ม') waiting++;
    if (statusUpdate === 'รับเรื่องแล้ว') received++;
  }

  await client.pushMessage(GROUP_ID, {
    type: 'text',
    text:
      `📊 สรุปประจำวัน\n` +
      `รับใหม่วันนี้: ${newToday}\n` +
      `กำลังดำเนินการ: ${doing}\n` +
      `รอข้อมูลเพิ่ม: ${waiting}\n` +
      `รับเรื่องแล้ว: ${received}`
  });

}, { timezone: "Asia/Bangkok" });

/* ================= SERVER ================= */
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
