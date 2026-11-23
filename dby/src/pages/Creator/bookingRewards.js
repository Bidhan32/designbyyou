export const bookingRewardBands = [
  { label: "Free", points: 0 },
  { label: "Basic", points: 5 },
  { label: "Pro", points: 10 },
  { label: "Enterprise", points: "Based on your needs", benefit: "Your own branding" },
];

export function bookingRewardEstimate(amount) {
  return Number(amount) > 0 ? "Booking rewards depend on your membership. Eligible plans earn points on the discounted design price when the booking is completed." : "";
}
