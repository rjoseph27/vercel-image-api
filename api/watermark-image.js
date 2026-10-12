const sharp = require("sharp");
const path = require("path");
const crypto = require("crypto");

const logoPath = path.join(process.cwd(), "assets", "logo.png");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  try {
    const { imageBuffer: base64Data } = req.body;
    if (!base64Data) {
      return res
        .status(400)
        .json({ success: false, message: "Missing imageBuffer" });
    }

    const fileBuffer = Buffer.from(base64Data, "base64");
    const filename = `${crypto.randomUUID()}.jpg`;

    // 1. Process Metadata & Logo Scaling
    const metadata = await sharp(fileBuffer).metadata();
    const imageWidth = metadata.width || 1000;
    const logoWidth = Math.round(imageWidth * 0.6);

    const logoBuffer = await sharp(logoPath)
      .resize({ width: logoWidth, fit: "inside" })
      .png()
      .toBuffer();

    const logoMetadata = await sharp(logoBuffer).metadata();
    const logoHeight = logoMetadata.height || logoWidth;

    const watermarkSvg = `
      <svg width="${logoWidth}" height="${logoHeight}" xmlns="http://www.w3.org/2000/svg">
        <image href="data:image/png;base64,${logoBuffer.toString("base64")}"
               width="${logoWidth}" height="${logoHeight}" opacity="0.60" />
      </svg>
    `;

    // 2. Composite Watermark
    const processedImageBuffer = await sharp(fileBuffer)
      .composite([{ input: Buffer.from(watermarkSvg), gravity: "center" }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // 3. Return the watermarked image buffer as base64
    return res.status(200).json({
      success: true,
      filename,
      imageBuffer: processedImageBuffer.toString("base64"),
    });
  } catch (error) {
    console.error("Watermark serverless error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
