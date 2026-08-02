const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // 1. Create a transporter using your Gmail credentials
    const transporter = nodemailer.createTransport({
        service: 'gmail',
       host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // 2. Define the email options
    const mailOptions = {
        from: `"DesignByYou" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.html,
    };

    // 3. Actually send the email
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✨ Email sent successfully to: ${options.email}`);
    } catch (error) {
        console.error("❌ Email send failed: ", error);
        throw new Error("Email could not be sent");
    }
};

module.exports = sendEmail;