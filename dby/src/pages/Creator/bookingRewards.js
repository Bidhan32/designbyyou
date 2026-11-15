export const bookingRewardBands = [
  { minimum: 100, points: 20, label: "$100 or more" },
  { minimum: 50, points: 10, label: "$50 to $99.99" },
  { minimum: 40, points: 8, label: "$40 to $49.99" },
  { minimum: 30, points: 6, label: "$30 to $39.99" },
  { minimum: 20, points: 4, label: "$20 to $29.99" },
  { minimum: 10, points: 2, label: "$10 to $19.99" },
  { minimum: 0, points: 0, label: "Under $10" },
];

export function bookingRewardEstimate(amount) {
  const price = Number(amount);
  if (!Number.isFinite(price) || price <= 0) return "";
  const points = bookingRewardBands.find(band => price >= band.minimum).points;
  const dollars = price.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return points ? `Earn ${points} points when this ${dollars} booking is completed.` : "Bookings under $10 earn no points.";
}
