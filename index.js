require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

const client = new line.Client(config);

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  if (event.message.text.startsWith('#issue')) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'รับ issue แล้ว เดี๋ยวจัดการให้ 👨‍💻'
    });
  }

  return Promise.resolve(null);
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
