export const makeValidURI = (url: string): string => {
    console.log(url)
    return encodeURI(url.replace(/\|/g, "%7C"));
};