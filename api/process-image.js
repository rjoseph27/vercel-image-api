const sharp = require("sharp");

// ---------------------------------------------------------------------------
// Screened Image Detection Helper
// ---------------------------------------------------------------------------

async function isScreenedImage(buffer) {
  const size = 512;
  const { data, info } = await sharp(buffer)
    .resize(size, size, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  const rowMeans = new Float64Array(height);
  const colMeans = new Float64Array(width);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += data[y * width + x];
    }
    rowMeans[y] = sum / width;
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      sum += data[y * width + x];
    }
    colMeans[x] = sum / height;
  }

  const rowDiffs = [];
  for (let i = 1; i < height; i++) {
    rowDiffs.push(rowMeans[i] - rowMeans[i - 1]);
  }

  const colDiffs = [];
  for (let i = 1; i < width; i++) {
    colDiffs.push(colMeans[i] - colMeans[i - 1]);
  }

  function computeAutocorrelationPeakScore(arr) {
    const n = arr.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += arr[i];
    mean /= n;

    let variance = 0;
    for (let i = 0; i < n; i++) {
      variance += (arr[i] - mean) ** 2;
    }
    if (variance === 0) return 0;

    let maxAutoCorr = 0;
    for (let lag = 2; lag <= 16; lag++) {
      let cov = 0;
      for (let i = 0; i < n - lag; i++) {
        cov += (arr[i] - mean) * (arr[i + lag] - mean);
      }
      const autoCorr = cov / variance;
      if (autoCorr > maxAutoCorr) {
        maxAutoCorr = autoCorr;
      }
    }
    return maxAutoCorr;
  }

  const rowScore = computeAutocorrelationPeakScore(rowDiffs);
  const colScore = computeAutocorrelationPeakScore(colDiffs);

  const score = (rowScore + colScore) / 2;
  const isScreened = score > 0.8;

  return { isScreened, score };
}

module.exports = async (req, res) => {
  // 1. Ensure it's a POST request
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 2. Extract the image buffer from the request body
    const { imageBuffer } = req.body;
    if (!imageBuffer) {
      return res
        .status(400)
        .json({ error: "No image buffer provided in request body." });
    }

    // 3. Convert base64 string back into a Node.js Buffer
    const buffer = Buffer.from(imageBuffer, "base64");

    // 4. Run your screening check function
    const isScreened = await isScreenedImage(buffer);

    // 5. Return the result
    return res.status(200).json({
      success: true,
      isScreenedImage: isScreened,
    });
  } catch (error) {
    console.error("Serverless execution error:", error);
    return res.status(500).json({ error: error.message });
  }
};
