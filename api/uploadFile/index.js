const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } = require('@azure/storage-blob');
const { verifyToken } = require("../shared/auth");

// Azure Blob connection string
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

// Define the container name
const containerName = 'uploads';
const containerClient = blobServiceClient.getContainerClient(containerName);

module.exports = async function (context, req) {
    try {
        // Secure the endpoint: only logged-in users can upload.
        verifyToken(req);
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file) {
            context.res = {
                status: 400,
                body: { message: 'No file uploaded.' }
            };
            return;
        }

        const fileName = file.name;
        // Convert the file to a buffer for uploading.
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Ensure the container exists (create if not)
        await containerClient.createIfNotExists();

        // Upload the file to Azure Blob Storage
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.uploadData(fileBuffer);

        // Instead of returning a public URL, generate a secure, time-limited SAS URL.
        const sasStartsOn = new Date();
        const sasExpiresOn = new Date(sasStartsOn.valueOf() + 60 * 60 * 1000); // 1 hour validity

        const sasOptions = {
            containerName: containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse("r"), // "r" for read-only permission
            startsOn: sasStartsOn,
            expiresOn: sasExpiresOn,
        };

        const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential).toString();
        const sasUrl = `${blockBlobClient.url}?${sasToken}`;

        // Log success and respond
        context.log(`File uploaded successfully: ${fileName}`);
        context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: {
                message: 'File uploaded successfully.',
                url: sasUrl,                  
                fileName: fileName            
            }
        };
    } catch (err) {
        context.log.error('Upload failed:', err);
        context.res = {
            status: 500,
            body: { message: 'File upload failed.', error: err.message, stack: err.stack }
        };
    }
};
