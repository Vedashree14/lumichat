// uploadFile/index.js
const Busboy = require('busboy');
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions
} = require('@azure/storage-blob');
const { verifyToken } = require('../shared/auth');

const containerName = 'uploads';

function parseConnectionString(connStr) {
  const nameMatch = connStr && connStr.match(/AccountName=([^;]+)/i);
  const keyMatch = connStr && connStr.match(/AccountKey=([^;]+)/i);
  return {
    accountName: nameMatch ? nameMatch[1] : null,
    accountKey: keyMatch ? keyMatch[1] : null
  };
}

module.exports = async function (context, req) {
  try {
    // Auth
    verifyToken(req);

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      context.log.error('[uploadFile] Missing AZURE_STORAGE_CONNECTION_STRING');
      context.res = { status: 500, body: { message: 'Server misconfigured: storage connection string missing' } };
      return;
    }

    // Require content-type header (multipart/form-data)
    const contentType = req.headers && (req.headers['content-type'] || req.headers['Content-Type']);
    if (!contentType || !contentType.includes('multipart/form-data')) {
      context.log.warn('[uploadFile] Request not multipart/form-data');
      context.res = { status: 400, body: { message: 'Expected multipart/form-data' } };
      return;
    }

    // Prepare Busboy
    const busboy = new Busboy({ headers: req.headers });
    let fileBuffer = null;
    let fileName = null;
    let mimeType = 'application/octet-stream';

    // Parse form-data
    await new Promise((resolve, reject) => {
      busboy.on('file', (fieldname, fileStream, info) => {
        fileName = (info && (info.filename || info.name)) || `upload-${Date.now()}`;
        mimeType = (info && info.mimeType) || mimeType;
        const chunks = [];
        fileStream.on('data', (data) => chunks.push(data));
        fileStream.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
        fileStream.on('error', (err) => {
          context.log.error('[uploadFile] file stream error', err);
          reject(err);
        });
      });

      busboy.on('error', (err) => {
        context.log.error('[uploadFile] busboy error', err);
        reject(err);
      });

      busboy.on('finish', () => resolve());

      // Feed raw body
      try {
        if (req.rawBody && req.rawBody.length) {
          busboy.end(req.rawBody);
        } else if (req.body && typeof req.body === 'string') {
          busboy.end(Buffer.from(req.body));
        } else {
          // If there's no raw body, fail explicitly
          reject(new Error('No raw request body: ensure rawBody is enabled and request contains multipart data'));
        }
      } catch (err) {
        context.log.error('[uploadFile] error feeding busboy', err);
        reject(err);
      }
    });

    if (!fileBuffer || !fileName) {
      context.log.warn('[uploadFile] No file parsed from request');
      context.res = { status: 400, body: { message: 'No file uploaded' } };
      return;
    }

    // Upload to blob
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.uploadData(fileBuffer, { blobHTTPHeaders: { blobContentType: mimeType } });

    // Generate SAS using account key
    const { accountName, accountKey } = parseConnectionString(connectionString);
    if (!accountName || !accountKey) {
      context.log.error('[uploadFile] Could not parse account name/key from connection string');
      context.res = { status: 500, body: { message: 'Server misconfigured: missing storage account key' } };
      return;
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 60 * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName: fileName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn
    }, sharedKeyCredential).toString();

    const sasUrl = `${blockBlobClient.url}?${sasToken}`;

    context.log(`[uploadFile] Uploaded ${fileName} (${fileBuffer.length} bytes)`);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { message: 'File uploaded successfully.', url: sasUrl, fileName }
    };

  } catch (err) {
    context.log.error('[uploadFile] Upload failed:', err);
    context.res = { status: 500, body: { message: 'File upload failed', error: err.message, stack: err.stack } };
  }
};
