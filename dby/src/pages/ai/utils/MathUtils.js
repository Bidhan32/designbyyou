/*
=========================================================
FashionVision AI
Math Utilities
=========================================================
*/

export const EPSILON = 0.000001;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function inverseLerp(a, b, value) {
    if (a === b) return 0;
    return (value - a) / (b - a);
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
    const t = inverseLerp(inMin, inMax, value);
    return lerp(outMin, outMax, t);
}

export function normalize(value, min, max) {
    if (min === max) return 0;
    return (value - min) / (max - min);
}

export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

export function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

export function nearlyEqual(a, b, epsilon = EPSILON) {
    return Math.abs(a - b) <= epsilon;
}

export function round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

export function average(values) {
    if (!values.length) return 0;

    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values) {
    if (!values.length) return 0;

    const sorted = [...values].sort((a, b) => a - b);

    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

export function variance(values) {
    if (!values.length) return 0;

    const avg = average(values);

    const squared = values.map(v => Math.pow(v - avg, 2));

    return average(squared);
}

export function standardDeviation(values) {
    return Math.sqrt(variance(values));
}

export function min(values) {
    return Math.min(...values);
}

export function max(values) {
    return Math.max(...values);
}

export function sum(values) {
    return values.reduce((s, v) => s + v, 0);
}

export function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

export function smoothStep(edge0, edge1, x) {
    let t = clamp((x - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);
}

export function gaussian(x, mean = 0, sigma = 1) {
    const coefficient = 1 / (sigma * Math.sqrt(2 * Math.PI));

    const exponent = Math.exp(
        -Math.pow(x - mean, 2) / (2 * sigma * sigma)
    );

    return coefficient * exponent;
}

export function random(min = 0, max = 1) {
    return Math.random() * (max - min) + min;
}

export function randomInt(min, max) {
    return Math.floor(random(min, max + 1));
}

export function factorial(n) {
    if (n <= 1) return 1;

    let result = 1;

    for (let i = 2; i <= n; i++) {
        result *= i;
    }

    return result;
}

export function combination(n, r) {
    return factorial(n) / (factorial(r) * factorial(n - r));
}

export function bezierCoefficient(n, i) {
    return combination(n, i);
}

export function remap01(value, minValue, maxValue) {
    return clamp((value - minValue) / (maxValue - minValue), 0, 1);
}

export function snap(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}

export function isBetween(value, min, max) {
    return value >= min && value <= max;
}

export function distance1D(a, b) {
    return Math.abs(a - b);
}

export function percentage(value, total) {
    if (total === 0) return 0;
    return (value / total) * 100;
}

export function sign(value) {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}

export function cubicBezier(t, p0, p1, p2, p3) {

    const u = 1 - t;

    return (
        u * u * u * p0 +
        3 * u * u * t * p1 +
        3 * u * t * t * p2 +
        t * t * t * p3
    );

}

export function quadraticBezier(t, p0, p1, p2) {

    const u = 1 - t;

    return (
        u * u * p0 +
        2 * u * t * p1 +
        t * t * p2
    );

}

export function easeInOut(t) {

    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

}

export function triangleWave(x) {

    return 2 * Math.abs(x - Math.floor(x + 0.5));

}

export function pingPong(value, length) {

    value = value % (length * 2);

    return length - Math.abs(value - length);

}