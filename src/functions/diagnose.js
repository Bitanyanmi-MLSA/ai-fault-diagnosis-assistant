const { app } = require('@azure/functions');
const { getAiClient } = require('../lib/aiClient');
const { SYSTEM_PROMPT } = require('../lib/systemPrompt');
const { withCors, preflightResponse } = require('../lib/cors');

const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB raw image after base64 overhead

app.http('diagnose', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'diagnose',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return preflightResponse();
        }

        let payload;
        try {
            payload = await request.json();
        } catch {
            return jsonResponse(400, { error: 'Request body must be valid JSON.' });
        }

        const { imageBase64, mimeType, errorCode, symptoms, deviceType } = payload || {};

        if (!imageBase64 && !errorCode && !symptoms) {
            return jsonResponse(400, {
                error: 'Provide at least one of: imageBase64 (photo/video frame), errorCode, or symptoms.',
            });
        }

        if (imageBase64 && imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
            return jsonResponse(413, { error: 'Image is too large. Please use a smaller photo or video frame (under ~6MB).' });
        }

        const userContent = [];
        const context_lines = [];
        if (deviceType) context_lines.push(`Device type: ${deviceType}`);
        if (errorCode) context_lines.push(`Error code / on-screen message: ${errorCode}`);
        if (symptoms) context_lines.push(`Symptoms described by technician: ${symptoms}`);
        if (!imageBase64) context_lines.push('No photo was provided; diagnose from the text alone.');

        userContent.push({ type: 'text', text: context_lines.join('\n') || 'Diagnose the fault shown in the image.' });

        if (imageBase64) {
            const dataUrl = imageBase64.startsWith('data:')
                ? imageBase64
                : `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
            userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
        }

        try {
            const client = getAiClient();
            const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

            const completion = await client.chat.completions.create({
                model: deployment,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.2,
                max_tokens: 900,
                response_format: { type: 'json_object' },
            });

            const raw = completion.choices?.[0]?.message?.content || '{}';
            let diagnosis;
            try {
                diagnosis = JSON.parse(raw);
            } catch {
                diagnosis = { title: 'Diagnosis', likelyCauses: [], steps: [raw], confidence: 'low' };
            }

            return jsonResponse(200, { source: 'ai', ...diagnosis });
        } catch (error) {
            context.error('AI diagnosis failed:', error);
            return jsonResponse(502, {
                error: 'The AI diagnosis service is temporarily unavailable. Please try again shortly.',
            });
        }
    },
});

function jsonResponse(status, body) {
    return withCors({
        status,
        jsonBody: body,
    });
}
