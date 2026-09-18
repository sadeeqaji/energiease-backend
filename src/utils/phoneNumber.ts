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

