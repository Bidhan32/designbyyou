exports.otpTemplate = (name, otp) => {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #333; text-align: center;">DesignByYou</h2>
        <p>Hi ${name},</p>
        <p>Thank you for joining our fashion community. Please use the following One-Time Password (OTP) to verify your account:</p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #555;">
            ${otp}
        </div>
        <p>This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border:none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2026 DesignByYou Platform. All Rights Reserved.</p>
    </div>
    `;
};