const MAX_SIDE = 480;
const MAX_LENGTH = 200000; // keep in sync with the 240000 limit in firestore.rules

// Shrinks a JPG/PNG to a small JPEG data URL that fits in a Firestore document.
export async function resizeImage(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Only JPG or PNG pictures, please.');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('That picture is too big — pick one under 15 MB.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (let quality = 0.82; quality >= 0.4; quality -= 0.1) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_LENGTH) return url;
  }
  throw new Error('Could not shrink that picture enough — try another one.');
}

// Only accept what the rules allow, so a stored value can never break out of an src attribute.
export const isSafeImage = (value) => typeof value === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
