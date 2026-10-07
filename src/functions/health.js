const { app } = require('@azure/functions');

app.http('health', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'health',
    handler: async () => {
        return {
            status: 200,
            jsonBody: {
                status: 'ok',
                service: 'ai-fault-diagnosis-assistant-api',
                aiConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
            },
        };
    },
});
