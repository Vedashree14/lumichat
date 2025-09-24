// getUploadSas/index.js
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
  
  function sanitizeFileName(name = '') {
    // keep extension, remove dangerous chars
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
  
  module.exports = async function (context, req) {
    try {
      verifyToken(req);
  
      const { fileName } = req.body || {};
      if (!fileName) {
        context.res = { status: 400, body: { message: "Missing fileName in request body" } };
        return;
      }
  
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString) {
        throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING');
      }
  
      const { accountName, accountKey } = parseConnectionString(connectionString);
      if (!accountName || !accountKey) {
        throw new Error('Failed to parse account name/key from connection string');
      }
  
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists(); // ensure the container exists
  
      // Sanitise and produce unique blob name
      const blobName = `${Date.now()}-${sanitizeFileName(fileName)}`;
  
      // SAS times
      const startsOn = new Date(Date.now() - 5 * 60 * 1000); // -5m
      const uploadExpiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15m
      const readExpiresOn = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  
      // Create credential for signing SAS
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
  
      const uploadSas = generateBlobSASQueryParameters({
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('cw'), // create + write
        startsOn,
        expiresOn: uploadExpiresOn
      }, credential).toString();
  
      const readSas = generateBlobSASQueryParameters({
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn: readExpiresOn
      }, credential).toString();
  
      const blockClient = containerClient.getBlockBlobClient(blobName);
      const uploadUrl = `${blockClient.url}?${uploadSas}`;
      const downloadUrl = `${blockClient.url}?${readSas}`;
  
      context.res = {
        status: 200,
        body: { uploadUrl, downloadUrl, blobName }
      };
    } catch (err) {
      context.log.error('getUploadSas failed:', err);
      context.res = { status: 500, body: { message: 'Failed to generate SAS', error: err.message } };
    }
  };
  