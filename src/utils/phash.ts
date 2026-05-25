/**
 * Performs Average Perceptual Hashing (aHash) on a user-submitted image file.
 * Stretches the image onto an offscreen 8x8 canvas, grayscales the channel data,
 * and extracts a 64-bit binary fingerprint represented as a 16-character hex string.
 */
export function calculatePerceptualHash(file: File): Promise<{ hash: string; previewUrl: string; matrix: number[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Offscreen canvas setup (8x8 downscaling filters highfrequency noise)
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to acquire canvas 2D render context.'));
          return;
        }

        // Draw the uploaded screenshot stretched to fit the 8x8 grid
        ctx.drawImage(img, 0, 0, 8, 8);
        const imgData = ctx.getImageData(0, 0, 8, 8);
        const data = imgData.data;

        const grayscales: number[] = [];
        let totalSum = 0;

        // Grayscale conversion using luminance formula: Y = 0.299R + 0.587G + 0.114B
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const grayscale = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          grayscales.push(grayscale);
          totalSum += grayscale;
        }

        // Average gray value of the 64-pixel region
        const meanValue = totalSum / 64;

        // Construct 64-bit binary stream
        let binaryString = '';
        const matrix: number[][] = [];
        let currentRow: number[] = [];

        for (let idx = 0; idx < grayscales.length; idx++) {
          const val = grayscales[idx];
          const bit = val >= meanValue ? 1 : 0;
          binaryString += bit;
          currentRow.push(val);

          if (currentRow.length === 8) {
            matrix.push(currentRow);
            currentRow = [];
          }
        }

        // Convert 64-bit binary stream into 16-character hexadecimal string
        let hexHash = '';
        for (let splitIdx = 0; splitIdx < 64; splitIdx += 4) {
          const nibble = binaryString.substring(splitIdx, splitIdx + 4);
          hexHash += parseInt(nibble, 2).toString(16);
        }

        // Generate high resolution original image preview
        resolve({
          hash: hexHash,
          previewUrl: e.target?.result as string,
          matrix
        });
      };
      img.onerror = () => reject(new Error('Failed to deserialize image stream.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to load raw file buffer.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Computes the Hamming distance between two 16-character hex strings by
 * checking the number of opposing bits. A return of 0 is a perfect visual match,
 * while 64 is a direct visual inversion.
 */
export function computeHammingDistance(hex1: string, hex2: string): number {
  if (hex1.length !== 16 || hex2.length !== 16) {
    // Fallback safe calculation if hashes are differing formats or placeholders
    let diff = 0;
    for (let i = 0; i < Math.min(hex1.length, hex2.length); i++) {
      if (hex1[i] !== hex2[i]) diff += 4; // approximate character distance
    }
    return diff;
  }

  let distance = 0;
  for (let idx = 0; idx < 16; idx++) {
    const val1 = parseInt(hex1[idx], 16);
    const val2 = parseInt(hex2[idx], 16);
    // XOR bitwise operation identifies toggled bits
    const xorVal = val1 ^ val2;
    // Count amount of set bits in the XOR product
    let currentXor = xorVal;
    while (currentXor > 0) {
      if ((currentXor & 1) === 1) distance++;
      currentXor >>= 1;
    }
  }
  return distance;
}
