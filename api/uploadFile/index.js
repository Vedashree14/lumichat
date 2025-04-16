const { BlobServiceClient } = require('@azure/storage-blob');

// Azure Blob connection string
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

// Define the container name
const containerName = 'uploads';
const containerClient = blobServiceClient.getContainerClient(containerName);

module.exports = async function (context, req) {
    try {
        // Check for the 'Content-Type' header to handle multipart/form-data
        const contentType = req.headers['Content-Type'] || req.headers['content-type'];
        console.log('Content-Type:', contentType);

        if (!contentType || !contentType.includes('multipart/form-data')) {
            context.res = {
                status: 400,
                body: { message: 'Invalid content type. Please use multipart/form-data.' }
            };
            return;
        }

        // Parse the raw body
        const rawBody = req.rawBody; // Azure Functions stores raw body in `req.rawBody`

        if (!rawBody) {
            context.res = {
                status: 400,
                body: { message: 'No file uploaded.' }
            };
            return;
        }

        // Here, you would need to manually parse the multipart/form-data body.
        // A basic example (you can improve it further depending on the structure):
        const boundary = contentType.split('boundary=')[1];
        const parts = rawBody.split('--' + boundary);

        let fileBuffer = null;
        let fileName = '';

        // Loop through each part of the form data
        parts.forEach(part => {
            if (part.includes('Content-Disposition')) {
                // Check for the file part
                if (part.includes('filename')) {
                    const fileContent = part.split('\r\n\r\n')[1];  // Get the file content after the headers
                    fileBuffer = Buffer.from(fileContent, 'binary'); // Convert it to buffer
                    fileName = part.match(/filename="(.+)"/)[1]; // Extract the file name
                }
            }
        });

        if (!fileBuffer) {
            context.res = {
                status: 400,
                body: { message: 'No file uploaded.' }
            };
            return;
        }

        // Ensure the container exists (create if not)
        await containerClient.createIfNotExists();

        // Upload the file to Azure Blob Storage
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        const uploadResponse = await blockBlobClient.upload(fileBuffer, fileBuffer.length);

        // Log success and respond
        context.log(`File uploaded successfully: ${fileName}`);
        context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: {
                message: 'File uploaded successfully.',
                url: blockBlobClient.url,     // ✅ This is required
                fileName: fileName            // ✅ Optional, but helps for chat display
    }
        };
    } catch (err) {
        // Log error and respond with failure
        context.log('Upload failed:', err);
        context.res = {
            status: 500,
            body: { message: 'Upload failed.', error: err.message }
        };
    }
};
