const Busboy = require('busboy');
const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { verifyToken } = require('../shared/auth');

const containerName = 'uploads';

module.exports = async function (context, req) {
    try {
        // Authenticate
        verifyToken(req);

        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) throw new Error("Storage connection string missing");

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        // Parse multipart/form-data
        if (!req.headers || !req.headers['content-type']) {
            context.res = { status: 400, body: { message: 'Missing Content-Type header' } };
            return;
        }

        const busboy = new Busboy({ headers: req.headers });
        let fileBuffer = null;
        let fileName = null;
        let mimeType = null;

        await new Promise((resolve, reject) => {
            busboy.on('file', (fieldname, fileStream, info) => {
                fileName = info.filename || `upload-${Date.now()}`;
                mimeType = info.mimeType || 'application/octet-stream';
                const chunks = [];

                fileStream.on('data', (data) => chunks.push(data));
                fileStream.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                });
                fileStream.on('error', reject);
            });

            busboy.on('finish', resolve);
            busboy.on('error', reject);

            // feed rawBody to Busboy
            if (req.rawBody) busboy.end(req.rawBody);
            else reject(new Error('No rawBody found in request'));
        });

        if (!fileBuffer || !fileName) {
            context.res = { status: 400, body: { message: 'No file uploaded' } };
            return;
        }

        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.uploadData(fileBuffer, { blobHTTPHeaders: { blobContentType: mimeType } });

        // Generate SAS URL
        const accountName = connectionString.match(/AccountName=([^;]+)/i)[1];
        const accountKey = connectionString.match(/AccountKey=([^;]+)/i)[1];
        const credential = new StorageSharedKeyCredential(accountName, accountKey);

        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse('r'),
            startsOn: new Date(),
            expiresOn: new Date(Date.now() + 60 * 60 * 1000)
        }, credential).toString();

        const sasUrl = `${blockBlobClient.url}?${sasToken}`;

        context.res = { status: 200, body: { message: 'File uploaded', url: sasUrl, fileName } };

    } catch (err) {
        context.log.error('Upload failed', err);
        context.res = { status: 500, body: { message: 'Upload failed', error: err.message } };
    }
};
