import multer from "multer";
// Configure multer for memory storage
const multerFS = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (_req, file, cb) => {
        // Accept all files
        cb(null, true);
    },
});
export default multerFS;
