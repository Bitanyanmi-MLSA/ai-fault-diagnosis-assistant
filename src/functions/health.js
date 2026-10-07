const { app } = require('@azure/functions');
const { withCors, preflightResponse } = require('../lib/cors');

app.http('health', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'health',
    handler: async (request) => {
        if (request.method === 'OPTIONS') {
            return preflightResponse();
        }
        return withCors({
            status: 200,
            jsonBody: {
                status: 'ok',
                service: 'ai-fault-diagnosis-assistant-api',
                aiConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
            },
        });
    },
});
