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
  // parse AccountName and AccountKey
  const nameMatch = connStr.match(/AccountName=([^;]+)/i);
  const keyMatch = connStr.match(/AccountKey=([^;]+)/i);
  return {
    accountName: nameMatch ? nameMatch[1] : null,
    accountKey: keyMatch ? keyMatch[1] : null
  };
}

module.exports = async function (context, req) {
  try {
    // authorize
    verifyToken(req);

    // Ensure connection string exists
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      context.log.error('[uploadFile] No AZURE_STORAGE_CONNECTION_STRING set');
      context.res = { status: 500, body: { message: 'Server misconfigured: storage connection string missing' } };
      return;
    }

    // Parse multipart/form-data using Busboy
    if (!req.headers || !req.headers['content-type']) {
      context.log.error('[uploadFile] Missing content-type header');
      context.res = { status: 400, body: { message: 'Missing Content-Type header' } };
      return;
    }

    const busboy = new Busboy({ headers: req.headers });
    let fileBuffer = null;
    let fileName = null;
    let mimeType = null;

    await new Promise((resolve, reject) => {
      busboy.on('file', (fieldname, fileStream, info) => {
        fileName = (info && (info.filename || info.name)) || `upload-${Date.now()}`;
        mimeType = info && info.mimeType ? info.mimeType : (req.headers['content-type'] || 'application/octet-stream');

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
      // Azure Functions exposes the raw request body at req.rawBody (Buffer)
      // If req.rawBody isn't set, try req.body (but rawBody is preferred).
      try {
        if (req.rawBody && req.rawBody.length) {
          busboy.end(req.rawBody);
        } else if (req.body && typeof req.body !== 'object') {
          // raw string body
          busboy.end(Buffer.from(req.body));
        } else {
          // nothing to parse
          busboy.end();
        }
      } catch (err) {
        context.log.error('[uploadFile] error while feeding busboy', err);
        reject(err);
      }
    });

    if (!fileBuffer || !fileName) {
      context.log.warn('[uploadFile] No file parsed from request');
      context.res = { status: 400, body: { message: 'No file uploaded' } };
      return;
    }

    // Create BlobServiceClient and container client
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Ensure container exists
    await containerClient.createIfNotExists();

    // Upload
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: { blobContentType: mimeType }
    });

    // Generate SAS using StorageSharedKeyCredential (requires account key)
    const { accountName, accountKey } = parseConnectionString(connectionString);
    if (!accountName || !accountKey) {
      context.log.error('[uploadFile] Cannot parse accountName/accountKey from connection string');
      context.res = { status: 500, body: { message: 'Server misconfigured: storage account key missing' } };
      return;
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 60 * 60 * 1000); // 1 hour

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: fileName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn
      },
      sharedKeyCredential
    ).toString();

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
