const { z } = require('zod');

exports.createBookingSchema = {
    body: z.object({
        receiver_id: z.string().uuid('Invalid receiver identifier format.'),
        design_id: z.string().uuid('Invalid design identifier format.').nullable().optional(),
        brief_text: z.string().min(10, 'Brief must contain at least 10 characters.'),
        agreed_price: z.union([z.string(), z.number()])
            .transform(val => parseFloat(val))
            .refine(val => !isNaN(val) && val > 0, 'Price must be a definitive positive calculation.'),
        deadline: z.string().datetime('Deadline must be a verified ISO-8601 timestamp.'),
        booking_type: z.enum(['marketplace', 'custom']).optional()
    })
};

exports.releasePayoutSchema = {
    params: z.object({
        id: z.string().uuid('Invalid contract transaction parameter target.')
    })
};