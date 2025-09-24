const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { verifyToken } = require('../shared/auth');

const containerName = 'uploads';

module.exports = async function (context, req) {
    try {
        verifyToken(req);

        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) throw new Error("Storage connection string missing");

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        if (!req.body || !req.body.file) {
            context.res = { status: 400, body: { message: "No file uploaded" } };
            return;
        }

        const file = req.body.file; // browser FormData key: "file"
        const fileName = file.name || `upload-${Date.now()}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        await blockBlobClient.uploadData(fileBuffer, { blobHTTPHeaders: { blobContentType: file.type || 'application/octet-stream' } });

        // Generate SAS URL
        const { accountName, accountKey } = (() => {
            const m1 = connectionString.match(/AccountName=([^;]+)/i);
            const m2 = connectionString.match(/AccountKey=([^;]+)/i);
            return { accountName: m1[1], accountKey: m2[1] };
        })();

        const credential = new StorageSharedKeyCredential(accountName, accountKey);
        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse('r'),
            startsOn: new Date(),
            expiresOn: new Date(Date.now() + 60*60*1000)
        }, credential).toString();

        const sasUrl = `${blockBlobClient.url}?${sasToken}`;

        context.res = { status: 200, body: { message: 'File uploaded', url: sasUrl, fileName } };

    } catch (err) {
        context.log.error('Upload failed', err);
        context.res = { status: 500, body: { message: 'Upload failed', error: err.message } };
    }
};
