// fbLeadFormsService.ts
import { fbGet } from './fbClient.js';
/**
 * Batch fetch leadgen forms
 * @param formIds - Array of form IDs
 * @param accessToken - Meta access token for this request
 * @returns Object keyed by formId
 */
export async function getLeadForms(formIds, accessToken) {
    if (!formIds || formIds.length === 0) {
        console.log('[Lead Forms] No form IDs to fetch');
        return {};
    }
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    console.log(`[Lead Forms] Fetching ${formIds.length} lead forms`);
    console.log(`[Lead Forms] Form IDs:`, formIds.join(', '));
    const params = {
        ids: formIds.join(','),
        fields: ['id', 'name'].join(','),
    };
    const res = await fbGet('/', params, accessToken);
    const map = {};
    for (const [id, value] of Object.entries(res)) {
        const formValue = value;
        map[id] = {
            id: formValue.id,
            name: formValue.name,
        };
    }
    console.log(`[Lead Forms] Retrieved ${Object.keys(map).length} lead forms`);
    return map;
}
