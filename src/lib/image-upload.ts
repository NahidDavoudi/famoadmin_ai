const API_ORIGIN = 'https://api.famoacademy.ir';

/**
 * Resolves an instructor or supporter image URL (DataURL, absolute URL, or relative backend path).
 */
export function resolveEntityImageUrl(rawUrl?: string | null): string | null {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${API_ORIGIN}${trimmed}`;
  }
  return `${API_ORIGIN}/${trimmed}`;
}

/**
 * Converts an uploaded image File into a resized, compressed DataURL (max 320x320 JPEG/WebP)
 * so it can be previewed immediately, sent in JSON/FormData payloads, and persisted reliably.
 */
export function fileToAvatarDataUrl(file: File, maxDimension = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('فایل انتخاب‌شده باید تصویر (JPG، PNG یا WebP) باشد'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const result = String(reader.result || '');
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(result);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressed || result);
        } catch {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
