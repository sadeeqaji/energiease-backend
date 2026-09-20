export function formatNigerianPhoneNumber(phone: string): string {
    return phone.replace(/^(\+234)/, "0");
}

export function formatToWhatsAppPhone(phone?: string | null): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = '234' + cleaned.substring(1);
    } else if (cleaned.length === 10) {
        cleaned = '234' + cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('23') && !cleaned.startsWith('234')) {
        // Common typo where user types +23 instead of +234 before a 10-digit mobile number (e.g. 237019438856 -> 2347019438856)
        cleaned = '234' + cleaned.substring(2);
    }
    return cleaned;
}

/**
 * Returns all common format variants for a Nigerian phone number
 * (e.g. 234801..., 0801..., 801..., +234801...)
 * to ensure database queries match regardless of how the number was stored.
 */
export function getPhoneSearchVariants(phone?: string | null): string[] {
    if (!phone) return [];
    const trimmed = phone.trim();
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    const variants = new Set<string>();

    if (trimmed) variants.add(trimmed);
    if (!digitsOnly) return Array.from(variants);

    variants.add(digitsOnly);

    if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
        const national = '0' + digitsOnly.slice(3);
        const raw10 = digitsOnly.slice(3);
        variants.add(national);
        variants.add(raw10);
        variants.add('+' + digitsOnly);
    } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
        const intl = '234' + digitsOnly.slice(1);
        const raw10 = digitsOnly.slice(1);
        variants.add(intl);
        variants.add(raw10);
        variants.add('+' + intl);
    } else if (digitsOnly.length === 10) {
        variants.add('0' + digitsOnly);
        variants.add('234' + digitsOnly);
        variants.add('+234' + digitsOnly);
    } else if (digitsOnly.startsWith('23') && digitsOnly.length === 12) {
        const corrected = '234' + digitsOnly.slice(2);
        variants.add(corrected);
        variants.add('0' + digitsOnly.slice(2));
        variants.add(digitsOnly.slice(2));
        variants.add('+' + corrected);
    }

    return Array.from(variants);
}


