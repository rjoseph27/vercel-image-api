const sharp = require("sharp");

async function isScreenedImage(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(800, 800, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // --- CHECK 1: The Black Bezel ---
  let darkEdgePixels = 0;
  const edgeThreshold = 20;
  for (let y = 0; y < height; y++) {
    const leftPixel = data[y * width * channels];
    const rightPixel = data[(y * width + width - 1) * channels];
    if (leftPixel < edgeThreshold) darkEdgePixels++;
    if (rightPixel < edgeThreshold) darkEdgePixels++;
  }
  const isBezelDetected = darkEdgePixels / (height * 2) > 0.4;

  // --- CHECK 2: The Glare ---
  let whitePixels = 0;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
      whitePixels++;
    }
  }
  const isGlareDetected = whitePixels / (width * height) > 0.015;

  // --- CHECK 3: Sharpness (Blur) ---
  let sum = 0,
    sumSq = 0;
  for (let i = 1; i < data.length - channels; i += channels) {
    const val = data[i] - (data[i - channels] + data[i + channels]) / 2;
    sum += val;
    sumSq += val * val;
  }
  const mean = sum / (data.length / channels);
  const variance = sumSq / (data.length / channels) - mean * mean;
  const isBlurry = variance < 200;

  // --- CHECK 4: Local Pixel Variance (NEW) ---
  // We check how often adjacent pixels change drastically.
  // A screen grid creates tiny "steps" (pixelation) that real photos don't have.
  let localVarianceCount = 0;
  for (let i = 1; i < data.length - channels; i += channels) {
    // Compare pixel to its left neighbor
    const diff = Math.abs(data[i] - data[i - channels]);
    // If the difference is between 10 and 50, it's likely a screen pixel step
    if (diff > 10 && diff < 50) localVarianceCount++;
  }
  const pixelStepRatio = localVarianceCount / (data.length / channels);
  // If more than 15% of pixels have this "step" texture, it's a screen
  const isPixelated = pixelStepRatio > 0.15;

  // --- FINAL DECISION ---
  // It is a screen if:
  // 1. It has a black bezel
  // OR
  // 2. It has glare AND is blurry
  // OR
  // 3. It is blurry AND pixelated (catches cropped screen photos)
  const isScreened =
    isBezelDetected ||
    (isGlareDetected && isBlurry) ||
    (isBlurry && isPixelated);

  return {
    isScreened,
    debug: {
      isBezelDetected,
      isGlareDetected,
      variance,
      pixelStepRatio,
    },
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { imageBuffer } = req.body;
    if (!imageBuffer) return res.status(400).json({ error: "No buffer." });

    const buffer = Buffer.from(imageBuffer, "base64");
    const result = await isScreenedImage(buffer);

    console.log(
      `[Detection] Screened: ${result.isScreened} | Bezel: ${result.debug.isBezelDetected} | Glare: ${result.debug.isGlareDetected} | Var: ${result.debug.variance.toFixed(2)} | PixelRatio: ${result.debug.pixelStepRatio.toFixed(4)}`,
    );

    return res.status(200).json({
      success: true,
      isScreenedImage: result.isScreened,
      debug: result.debug,
    });
  } catch (error) {
    console.error("Serverless execution error:", error);
    return res.status(500).json({ error: error.message });
  }
};
