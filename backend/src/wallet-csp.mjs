// Near Connect's sandboxed wallet iframe inherits the embedding page's policy.
// Meteor uses its secure bridge for popup/mobile responses and embeds font data.
export function walletCsp(nonce){
 return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://rsms.me https://fonts.cdnfonts.com; img-src 'self' data: https://gateway.pinata.cloud https://meteorwallet.app https://raw.githubusercontent.com; font-src 'self' data: https://rsms.me https://fonts.cdnfonts.com; connect-src 'self' https: wss://mc.meteorwallet.app; frame-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
}
