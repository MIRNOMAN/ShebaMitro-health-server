/**
 * Utility for masking Protected Health Information (PHI) and Personally Identifiable Information (PII)
 * in HTTP request/response payloads, query parameters, headers, and logs.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'refreshtoken',
  'refreshtokenhash',
  'refresh_token_hash',
  'token',
  'accesstoken',
  'access_token',
  'authorization',
  'cookie',
  'otp',
  'pin',
  'secret',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'nid',
  'nationalid',
  'national_id',
  'bmdcregno',
  'bmdc_reg_no',
  'bmdcdocurl',
  'bmdc_doc_url',
  'qrcodehash',
  'qr_code_hash',
  'vitalsjson',
  'vitals_json',
  'medicalallergies',
  'medical_allergies',
  'allergies',
  'chiefcomplaints',
  'chief_complaints',
  'diagnosis',
  'overridejson',
  'override_json',
]);

/**
 * Mask an email address (e.g. "patient@domain.com" -> "p***t@domain.com")
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED_EMAIL]';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/**
 * Mask a phone number (e.g. "+8801712345678" -> "+88017****5678")
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '[REDACTED_PHONE]';
  const prefix = phone.startsWith('+') ? '+' + digits.slice(0, 5) : digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Mask credit/debit card number (e.g. "4111222233334444" -> "4111-****-****-4444")
 */
export function maskCardNumber(card: string): string {
  if (!card || typeof card !== 'string') return card;
  const digits = card.replace(/\D/g, '');
  if (digits.length >= 12) {
    return `${digits.slice(0, 4)}-****-****-${digits.slice(-4)}`;
  }
  return '[REDACTED_CARD]';
}

/**
 * Mask identifier (e.g. BMDC Reg "A-12345" -> "A-****5")
 */
export function maskIdentifier(idStr: string): string {
  if (!idStr || typeof idStr !== 'string') return idStr;
  if (idStr.length <= 3) return '***';
  return `${idStr.slice(0, 2)}****${idStr.slice(-2)}`;
}

/**
 * Recursively sanitize objects, arrays, and primitives by masking PHI and PII
 */
export function maskPhiPii(data: any, depth = 0, maxDepth = 8): any {
  if (depth > maxDepth || data === null || data === undefined) {
    return data;
  }

  // Primitive strings check
  if (typeof data === 'string') {
    // Check if string looks like an email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
      return maskEmail(data);
    }
    // Check if string looks like a phone number (10-15 digits with optional +)
    if (/^\+?\d{10,15}$/.test(data.replace(/[\s-]/g, ''))) {
      return maskPhone(data);
    }
    // Check if string looks like a credit card (13-19 digits)
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}$/.test(data)) {
      return maskCardNumber(data);
    }
    // Check JWT token
    if (/^Bearer\s+ey[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(data)) {
      return 'Bearer [REDACTED_JWT_TOKEN]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskPhiPii(item, depth + 1, maxDepth));
  }

  if (typeof data === 'object') {
    // Do not alter Buffer, Date, Error, etc.
    if (data instanceof Date || data instanceof RegExp || Buffer.isBuffer(data)) {
      return data;
    }

    const maskedObj: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (SENSITIVE_KEYS.has(lowerKey)) {
        if (typeof value === 'string' && (lowerKey.includes('phone') || lowerKey === 'emergencycontact')) {
          maskedObj[key] = maskPhone(value);
        } else if (typeof value === 'string' && lowerKey.includes('email')) {
          maskedObj[key] = maskEmail(value);
        } else if (typeof value === 'string' && lowerKey.includes('bmdc')) {
          maskedObj[key] = maskIdentifier(value);
        } else {
          maskedObj[key] = '[REDACTED_PHI_PII]';
        }
      } else {
        maskedObj[key] = maskPhiPii(value, depth + 1, maxDepth);
      }
    }

    return maskedObj;
  }

  return data;
}
