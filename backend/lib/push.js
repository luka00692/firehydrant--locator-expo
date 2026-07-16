const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Best-effort: a missing/invalid push token (or Expo being unreachable) must
// never fail the calling request — the caller already succeeded at the DB
// level, this is just a notification side-effect.
async function sendPushNotification(pushToken, title, body, data) {
  if (!pushToken) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data })
    });
  } catch (err) {
    console.error('push notification failed:', err.message);
  }
}

module.exports = { sendPushNotification };
