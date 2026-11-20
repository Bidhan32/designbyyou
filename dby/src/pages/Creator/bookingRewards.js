export const bookingRewardBands = [
  { label: "Free", points: 1 },
  { label: "Basic", points: 3 },
  { label: "Pro", points: 5 },
  { label: "Enterprise", points: "Custom" },
];

export function bookingRewardEstimate(amount) {
  return Number(amount) > 0 ? "Completed bookings earn membership points on the discounted design price. Fractional points carry forward." : "";
}
