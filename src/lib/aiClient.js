const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity');
const { AzureOpenAI } = require('openai');

const AZURE_COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

let client;

/**
 * Lazily creates a singleton AzureOpenAI client authenticated with the Function App's
 * managed identity (no API keys are stored or transmitted).
 */
function getAiClient() {
    if (client) {
        return client;
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

    if (!endpoint) {
        throw new Error('AZURE_OPENAI_ENDPOINT app setting is not configured.');
    }

    // AZURE_CLIENT_ID (set by infra) tells DefaultAzureCredential which user-assigned
    // managed identity to use when running in Azure.
    const credential = new DefaultAzureCredential();
    const azureADTokenProvider = getBearerTokenProvider(credential, AZURE_COGNITIVE_SERVICES_SCOPE);

    client = new AzureOpenAI({
        endpoint,
        deployment,
        apiVersion,
        azureADTokenProvider,
    });

    return client;
}

module.exports = { getAiClient };
