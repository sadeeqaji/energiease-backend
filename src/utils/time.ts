interface ExpirationDetails {
    expirationISO: string;
}

export function getMinutesRemaining(expirationISO: ExpirationDetails['expirationISO']): string {
    const expirationDate = new Date(expirationISO);
    const now = new Date();
    const timeRemaining = expirationDate.getTime() - now.getTime();

    const totalMinutes = Math.floor(timeRemaining / 1000 / 60);

    if (totalMinutes > 0) {
        return `The account number Expires in ${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
    } else {
        const expiredMinutes = Math.abs(totalMinutes);
        return `Expired ${expiredMinutes} minute${expiredMinutes !== 1 ? 's' : ''} ago`;
    }
}

export const expiresIn30Minutes = () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    return expiresAt.toISOString();

}