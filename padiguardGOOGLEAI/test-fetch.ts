import fs from 'fs';

async function test() {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const buffer = Buffer.from(b64, "base64");
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const form = new FormData();
  form.append('file', blob, 'image.jpg');

  const fetchRes = await fetch("https://riceapi-production.up.railway.app/predict", {
    method: "POST",
    body: form,
  });
  console.log(await fetchRes.json());
}
test().catch(console.error);
