// getUploadSas/index.js
const { StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
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
    // Authenticate
    verifyToken(req);

    const { fileName } = req.body || {};
    if (!fileName) {
      context.res = { status: 400, body: { message: "Missing fileName in request body" } };
      return;
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING');

    const { accountName, accountKey } = parseConnectionString(connectionString);
    if (!accountName || !accountKey) throw new Error('Could not parse storage account name/key');

    // sanitize fileName to safe blob name
    const blobName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const startsOn = new Date(Date.now() - 5 * 60 * 1000); // mitigate clock skew
    const uploadExpiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const readExpiresOn = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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

    const blobBase = `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}`;
    const uploadUrl = `${blobBase}?${uploadSas}`;
    const downloadUrl = `${blobBase}?${readSas}`;

    context.res = {
      status: 200,
      body: { uploadUrl, downloadUrl, blobName }
    };
  } catch (err) {
    context.log.error('getUploadSas failed:', err);
    context.res = { status: 500, body: { message: 'Failed to generate SAS', error: err.message } };
  }
};
