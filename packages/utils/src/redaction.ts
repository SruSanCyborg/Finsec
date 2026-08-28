/**
 * Redacts sensitive credentials (e.g. sk_live_..., AWS keys, JWT tokens, private keys)
 * from text and code snippets to prevent accidental credential leakage in the GUI.
 */
export function redactSensitiveText(text: string): string {
  if (!text) return '';

  return text
    // API keys & secret tokens (e.g. sk_live_123456789)
    .replace(/(sk_[live|test]+_)[a-zA-Z0-9]{8,}/g, '$1••••••••')
    // AWS Access Key ID / Secret
    .replace(/(AKIA[0-9A-Z]{16})/g, 'AKIA••••••••••••••••')
    .replace(/(aws_secret_access_key\s*=\s*)["']?[a-zA-Z0-9/+=]{30,}["']?/gi, '$1"••••••••••••••••"')
    // Generic API Key assignments
    .replace(/(apiKey|api_key|privateKey|secret_key|authToken)\s*[:=]\s*["']([^"']{6,})["']/gi, '$1: "••••••••"')
    // Bearer tokens
    .replace(/(Bearer\s+)[a-zA-Z0-9-._~+/]+=*/g, '$1••••••••');
}
