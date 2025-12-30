export const safeDivide = (numerator, denominator) => {
    if (denominator === 0 || !denominator) {
        return 0;
    }
    return numerator / denominator;
};
export const calculatePerformance = (actual, target) => {
    if (target === 0) {
        return actual > 0 ? 1 : 0;
    }
    return safeDivide(actual, target) - 1;
};
