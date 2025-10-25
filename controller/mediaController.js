const { ObjectId } = require('mongodb');
const { StatusCodes } = require('http-status-codes');
const { getBucket } = require('../utils/gridfs');

/**
 * Upload a single file (multer memory storage).
 * Responds with GridFS metadata: id, filename, length, contentType.
 */
async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: 'No file uploaded' });
    }

    const bucket = getBucket();
    const { originalname, buffer, mimetype } = req.file;

    const uploadStream = bucket.openUploadStream(originalname, {
      contentType: mimetype,
    });

    // Write the buffer and end the stream
    uploadStream.end(buffer);

    uploadStream.on('error', (err) => {
      console.error('GridFS upload error:', err);
      if (!res.headersSent) {
        res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: 'Upload failed' });
      }
    });

    uploadStream.on('finish', async () => {
      try {
        // The 'finish' event doesn't pass a file doc; we look it up
        const _id = uploadStream.id;
        const docs = await bucket.find({ _id }).toArray();
        const file = docs[0];

        if (!file) {
          return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: 'Upload finished but metadata missing' });
        }

        res
          .status(StatusCodes.CREATED)
          .json({
            success: true,
            data: {
              id: file._id,
              filename: file.filename,
              length: file.length,
              contentType: file.contentType,
            },
          });
      } catch (e) {
        console.error('GridFS lookup after finish failed:', e);
        if (!res.headersSent) {
          res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: 'Upload stored but metadata lookup failed' });
        }
      }
    });
  } catch (e) {
    console.error('uploadFile error:', e);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: 'Upload failed' });
  }
}

/**
 * Stream a file by id, supports byte-range (video/audio) and full download.
 */
async function streamFile(req, res) {
  const { id } = req.params;
  let _id;
  try {
    _id = new ObjectId(id);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid id' });
  }

  const bucket = getBucket();
  const files = await bucket.find({ _id }).toArray();
  if (!files || !files.length) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const file = files[0];
  const range = req.headers.range;

  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    // e.g., "bytes=0-"
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : file.length - 1;

    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(416).send('Requested Range Not Satisfiable');
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${file.length}`);
    res.setHeader('Content-Length', chunkSize);

    const stream = bucket.openDownloadStream(_id, { start, end: end + 1 });
    stream.on('error', () => res.sendStatus(404));
    return stream.pipe(res);
  }

  // Full content
  res.setHeader('Content-Length', file.length);
  const stream = bucket.openDownloadStream(_id);
  stream.on('error', () => res.sendStatus(404));
  return stream.pipe(res);
}

/**
 * Delete a file by id (no-op if not found)
 */
async function deleteFile(req, res) {
  const { id } = req.params;
  let _id;
  try {
    _id = new ObjectId(id);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid id' });
  }

  const bucket = getBucket();
  try {
    await bucket.delete(_id);
  } catch (e) {
    // ignore missing file errors
  }
  return res.status(204).send();
}

module.exports = { uploadFile, streamFile, deleteFile };
