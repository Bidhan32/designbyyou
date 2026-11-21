export const bookingRewardBands = [
  { label: "Free", points: 10 },
  { label: "Basic", points: 5 },
  { label: "Pro", points: 10 },
  { label: "Enterprise", points: "Custom" },
];

export function bookingRewardEstimate(amount) {
  return Number(amount) > 0 ? "Completed bookings earn membership points on the discounted design price. Fractional points carry forward." : "";
}
