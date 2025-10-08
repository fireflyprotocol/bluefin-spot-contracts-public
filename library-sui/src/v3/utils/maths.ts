export function generateRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    // The maximum is exclusive and the minimum is inclusive
    return Math.floor(Math.random() * (min - max) + min);
}

export function generateSalt(): number {
    return (
        Date.now() +
        generateRandomInt(0, 1_000_000) +
        generateRandomInt(0, 1_000_000) +
        generateRandomInt(0, 1_000_000)
    );
}

export function getRandomString(length: number): string {
    return (Math.random() + 1).toString(36).substring(length + 1);
}
