export const isTeamTest = campaign => campaign?.campaignType === 'team-test' || campaign?.publication?.manifest?.campaignType === 'team-test';
export const deliveryLabel = campaign => isTeamTest(campaign) ? 'Team test · no physical delivery' : 'Printing & installation included';
export const testCampaignCopy = 'This is a team-run mainnet test with an AI-generated vehicle. Payments use real USDC. Artwork and delivery evidence are synthetic; no physical ad will be installed.';
export const campaignNotice = campaign => isTeamTest(campaign) ? `<div class="notice team-test-notice"><div><strong>Team test · AI-generated vehicle</strong><p>${testCampaignCopy}</p></div></div>` : '';
