const WEBHOOK_URL = 'https://YOUR_PUBLIC_BOT_URL/webhooks/google-form-submit';
const WEBHOOK_SECRET = 'PASTE_THE_SAME_VALUE_AS_WEBHOOK_SECRET';

function onFormSubmit(e) {
  const sheet = e.range.getSheet();

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Webhook-Secret': WEBHOOK_SECRET,
    },
    payload: JSON.stringify({
      spreadsheetId: e.source.getId(),
      sheetName: sheet.getName(),
      rowNumber: e.range.getRow(),
    }),
  });
}
