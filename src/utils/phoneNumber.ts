export function formatNigerianPhoneNumber(phone: string): string {
    return phone.replace(/^(\+234)/, "0");
}

