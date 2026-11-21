import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed."
      );
      error.statusCode = 400;
      return callback(error);
    }

    callback(null, true);
  },
});

export const uploadComplaintImages = (req, res, next) => {
  upload.array("images", 5)(req, res, async (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode =
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

        error.message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Each image must be 5 MB or smaller."
            : error.code === "LIMIT_FILE_COUNT"
              ? "Maximum 5 images are allowed."
              : error.message;
      }

      return next(error);
    }

    try {
      const files = req.files || [];

      const verifiedImages = [];

      for (const file of files) {
        const detectedType = await fileTypeFromBuffer(file.buffer);

        if (
          !detectedType ||
          !allowedMimeTypes.has(detectedType.mime)
        ) {
          const validationError = new Error(
            `Invalid image file: ${file.originalname}. Upload a genuine JPG, PNG or WEBP image.`
          );

          validationError.statusCode = 400;
          throw validationError;
        }

        verifiedImages.push({
          buffer: file.buffer,
          extension:
            detectedType.mime === "image/jpeg"
              ? "jpg"
              : detectedType.mime === "image/png"
                ? "png"
                : "webp",
          mediaType: "IMAGE",
        });
      }

      req.verifiedImages = verifiedImages;

      next();
    } catch (verificationError) {
      next(verificationError);
    }
  });
};
