
const scopes = [
    'contacts.readonly',
    'contacts.write',
    'calendars.readonly',
    'calendars.write',
    'calendars/events.readonly',
    'calendars/events.write',
    'users.readonly',
    'users.write',
    'locations.readonly',
    'locations/customFields.readonly',
    'locations/customFields.write',
    'locations/tags.readonly',
    'locations/tags.write',
    'opportunities.readonly',
    'opportunities.write',
    'products.readonly',
    'products.write',
];

const clientId = '69469c534798001a25fc61a3-mjeaws7l';
const redirectUri = 'http://localhost:3000/api/v1/integrations/crm/oauth/callback';
const baseUrl = 'https://marketplace.leadconnectorhq.com/oauth/chooselocation';

const scopeString = scopes.join(' ');
const encodedScopes = encodeURIComponent(scopeString);
const encodedRedirectUri = encodeURIComponent(redirectUri);

const url = `${baseUrl}?response_type=code&redirect_uri=${encodedRedirectUri}&client_id=${clientId}&scope=${encodedScopes}`;

console.log(url);
