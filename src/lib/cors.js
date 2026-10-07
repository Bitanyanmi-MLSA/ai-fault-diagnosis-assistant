// Azure Functions Flex Consumption does not currently support platform-level CORS
// (siteConfig.cors is silently ignored), so we add the headers ourselves here.
// See: https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan#considerations
const ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN || '*';

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function withCors(response) {
    return {
        ...response,
        headers: { ...corsHeaders(), ...(response.headers || {}) },
    };
}

function preflightResponse() {
    return { status: 204, headers: corsHeaders() };
}

module.exports = { corsHeaders, withCors, preflightResponse };
