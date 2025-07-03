export const safeDivide = (numerator: number, denominator: number): number => {
    if (denominator === 0 || !denominator) {
      return 0;
    }
    return numerator / denominator;
  };
  
  export const calculatePerformance = (actual: number, target: number): number => {
      if (target === 0) {
          return actual > 0 ? 1 : 0;
      }
      return safeDivide(actual, target) - 1;
  };