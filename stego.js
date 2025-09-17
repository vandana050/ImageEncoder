// Simple LSB stego (1 bit per color channel per pixel) with a 32-bit length header (number of bytes).
const fileInput = document.getElementById('fileInput');
const previewWrap = document.getElementById('previewWrap');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let loadedImage = null;

function loadImageFile(file, cb) {
  const img = new Image();
  img.onload = () => cb(null, img);
  img.onerror = (e) => cb(e);
  img.src = URL.createObjectURL(file);
}

fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  loadImageFile(f, (err, img) => {
    if (err) return alert('Could not load image');
    loadedImage = img;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    previewWrap.innerHTML = '';
    const thumb = document.createElement('img');
    thumb.src = canvas.toDataURL('image/png');
    previewWrap.appendChild(thumb);
  });
});

function textToBytes(str) {
  return new TextEncoder().encode(str);
}
function bytesToText(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// 🔽 Separate download helper
function downloadCanvasImage() {
  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "stego.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  } else {
    // fallback for older browsers
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "stego.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function embedMessage(message) {
  if (!loadedImage) { alert('Load a cover image first'); return; }
  const msgBytes = textToBytes(message);
  const length = msgBytes.length;

  // header: 32-bit unsigned length (big-endian)
  const header = new Uint8Array(4);
  header[0] = (length >>> 24) & 0xff;
  header[1] = (length >>> 16) & 0xff;
  header[2] = (length >>> 8) & 0xff;
  header[3] = length & 0xff;

  const payload = new Uint8Array(4 + length);
  payload.set(header, 0);
  payload.set(msgBytes, 4);

  // get image data
  ctx.drawImage(loadedImage, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // capacity: 3 bits per pixel (R,G,B channels)
  const capacityBits = Math.floor(data.length / 4) * 3;
  if (payload.length * 8 > capacityBits) {
    alert(`Message too long. Max bytes ≈ ${Math.floor(capacityBits/8)} bytes for this image.`);
    return;
  }

  // write bits
  let bitIdx = 0;
  for (let i = 0; i < payload.length; i++) {
    let byte = payload[i];
    for (let b = 7; b >= 0; b--) {
      const bit = (byte >> b) & 1;
      const pixelIndex = Math.floor(bitIdx / 3) * 4;
      const channel = bitIdx % 3; // 0->R,1->G,2->B
      const dataIndex = pixelIndex + channel;
      data[dataIndex] = (data[dataIndex] & 0xFE) | bit; // set LSB
      bitIdx++;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  downloadCanvasImage(); // ✅ trigger download
}

// Embed button
document.getElementById('embedBtn').addEventListener('click', () => {
  const msg = document.getElementById('message').value || '';
  if (msg.length === 0) { alert('Type a message to embed'); return; }
  embedMessage(msg);
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('message').value = '';
  previewWrap.innerHTML = '';
  loadedImage = null;
  fileInput.value = '';
});

//// Decoding
const stegoFile = document.getElementById('stegoFile');
const decodedEl = document.getElementById('decoded');

function decodeFromImage(img) {
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const totalPixels = Math.floor(data.length / 4);
  const capacityBits = totalPixels * 3;

  function readBit(bitIdx) {
    const pixelIndex = Math.floor(bitIdx / 3) * 4;
    const channel = bitIdx % 3;
    const dataIndex = pixelIndex + channel;
    return data[dataIndex] & 1;
  }

  // read 32 bits -> length
  let len = 0;
  for (let i = 0; i < 32; i++) {
    len = (len << 1) | readBit(i);
  }

  if (len < 0 || len > Math.floor(capacityBits / 8)) {
    decodedEl.textContent = 'No hidden message found or message length invalid.';
    return;
  }

  const totalBitsNeeded = (4 + len) * 8;
  if (totalBitsNeeded > capacityBits) {
    decodedEl.textContent = 'Encoded length exceeds capacity — corrupted or no message.';
    return;
  }

  const out = new Uint8Array(4 + len);
  for (let byteIdx = 0; byteIdx < out.length; byteIdx++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      const bit = readBit(byteIdx * 8 + b);
      val = (val << 1) | bit;
    }
    out[byteIdx] = val;
  }
  const payload = out.slice(4);
  decodedEl.textContent = bytesToText(payload);
}

// Decode button
document.getElementById('decodeBtn').addEventListener('click', () => {
  const f = stegoFile.files[0];
  if (!f) { alert('Pick an image that may contain a message'); return; }
  loadImageFile(f, (err, img) => {
    if (err) return alert('Could not load image');
    decodeFromImage(img);
  });
});

