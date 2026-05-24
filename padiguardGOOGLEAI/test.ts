import axios from 'axios';
import FormData from 'form-data';

// 1x1 transparent png
const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function test() {
  const form = new FormData();
  form.append('file', Buffer.from(b64, 'base64'), { filename: 'test.png', contentType: 'image/png' });
  try {
    const res = await axios.post('https://riceapi-production.up.railway.app/predict', form, {
      headers: form.getHeaders(),
    });
    console.log(res.data);
  } catch (e: any) {
    console.error(e.response?.data || e.message);
  }
}

test();
